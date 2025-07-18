from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError

class HrExpense(models.Model):
    _inherit = 'hr.expense'
    
    def action_post_directly(self):
        """Post expense directly to accounting without approval workflow"""
        if not self.sheet_id:
            # Create expense sheet automatically
            sheet_vals = {
                'name': f"Direct Expense - {self.name}",
                'employee_id': self.employee_id.id,
                'expense_line_ids': [(4, self.id)],
                'company_id': self.company_id.id,
            }
            sheet = self.env['hr.expense.sheet'].create(sheet_vals)
            self.sheet_id = sheet.id
        
        # Post the expense sheet directly
        return self.sheet_id.action_post_directly()

class HrExpenseSheet(models.Model):
    _inherit = 'hr.expense.sheet'
    
    def action_post_directly(self):
        """Post expense sheet directly to accounting"""
        self.ensure_one()
        
        # Validate required fields
        if not self.expense_line_ids:
            raise UserError(_("You cannot post an expense sheet without expenses."))
        
        if not self.journal_id:
            # Set default journal if not set
            journal = self.env['account.journal'].search([
                ('type', '=', 'purchase'),
                ('company_id', '=', self.company_id.id)
            ], limit=1)
            if not journal:
                raise UserError(_("No purchase journal found. Please create one or set it in expense settings."))
            self.journal_id = journal.id
        
        # Skip validation checks and directly create moves
        self._direct_create_moves()
        
        # Set state to posted
        self.write({
            'state': 'post',
            'approval_state': 'approve',
            'approval_date': fields.Date.context_today(self),
        })
        
        # Post the moves
        self.account_move_ids.action_post()
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Success'),
                'message': _('Expense has been posted directly to accounting.'),
                'type': 'success',
                'sticky': False,
            }
        }
    
    def _direct_create_moves(self):
        """Create account moves without approval workflow checks"""
        self.ensure_one()
        
        if self.account_move_ids:
            return self.account_move_ids
        
        # Create the move
        move_vals = self._prepare_move_vals()
        move = self.env['account.move'].create(move_vals)
        
        return move
    
    def _prepare_move_vals(self):
        """Prepare values for creating account move"""
        self.ensure_one()
        
        move_lines = []
        
        # Create move lines for each expense
        for expense in self.expense_line_ids:
            # Expense line (debit)
            expense_line_vals = {
                'name': expense.name,
                'account_id': expense.account_id.id,
                'debit': expense.total_amount,
                'credit': 0,
                'partner_id': expense.employee_id.sudo().work_contact_id.id,
                'expense_id': expense.id,
            }
            move_lines.append((0, 0, expense_line_vals))
            
            # Tax lines if any
            for tax in expense.tax_ids:
                tax_vals = self._prepare_tax_line_vals(expense, tax)
                if tax_vals:
                    move_lines.append((0, 0, tax_vals))
        
        # Credit line (payable or outstanding)
        credit_line_vals = self._prepare_credit_line_vals()
        move_lines.append((0, 0, credit_line_vals))
        
        return {
            'journal_id': self.journal_id.id,
            'date': self.accounting_date or fields.Date.context_today(self),
            'ref': self.name,
            'line_ids': move_lines,
            'company_id': self.company_id.id,
        }
    
    def _prepare_tax_line_vals(self, expense, tax):
        """Prepare tax line values"""
        tax_amount = expense.total_amount - expense.untaxed_amount
        if not tax_amount:
            return False
            
        return {
            'name': f"Tax - {expense.name}",
            'account_id': tax.account_id.id or tax.tax_group_id.tax_receivable_account_id.id,
            'debit': tax_amount if tax_amount > 0 else 0,
            'credit': abs(tax_amount) if tax_amount < 0 else 0,
            'tax_line_id': tax.id,
            'partner_id': False,
        }
    
    def _prepare_credit_line_vals(self):
        """Prepare credit line values (payable/outstanding account)"""
        total_amount = sum(self.expense_line_ids.mapped('total_amount'))
        
        if self.payment_mode == 'own_account':
            # Employee paid - use employee as partner
            account = self.employee_id.sudo().work_contact_id.property_account_payable_id
            partner_id = self.employee_id.sudo().work_contact_id.id
        else:
            # Company paid - use outstanding account
            account = self.company_id.account_journal_suspense_account_id
            partner_id = False
        
        if not account:
            raise UserError(_("No payable account found. Please configure the accounting settings."))
        
        return {
            'name': f"Expense Payment - {self.name}",
            'account_id': account.id,
            'credit': total_amount,
            'debit': 0,
            'partner_id': partner_id,
        }