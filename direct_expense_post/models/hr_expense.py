# Add this to your models/hr_expense.py file

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError


class HrExpense(models.Model):
    _inherit = 'hr.expense'

    # Override default methods to set defaults
    @api.model
    def default_get(self, fields_list):
        """Set default values for new expenses"""
        defaults = super().default_get(fields_list)

        # Set default product to "Expenses" (EXP_GEN)
        if 'product_id' in fields_list:
            expense_product = self.env.ref('hr_expense.product_product_no_cost_product_template',
                                           raise_if_not_found=False)
            if expense_product:
                defaults['product_id'] = expense_product.id

        # Set default payment mode to company account
        if 'payment_mode' in fields_list:
            defaults['payment_mode'] = 'company_account'

        # Ensure name field is empty by default (remove any auto-generated values)
        if 'name' in fields_list:
            defaults['name'] = ''

        # Clear tax fields since we don't use them
        if 'tax_ids' in fields_list:
            defaults['tax_ids'] = []

        return defaults

    @api.model
    def create(self, vals):
        """Override create method"""
        return super().create(vals)

    def write(self, vals):
        """Override write method"""
        return super().write(vals)

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
        self.sheet_id.action_post_directly()

        # Return action to open the expense sheet (like normal submit workflow)
        return {
            'type': 'ir.actions.act_window',
            'name': _('Expense Report'),
            'res_model': 'hr.expense.sheet',
            'res_id': self.sheet_id.id,
            'view_mode': 'form',
            'views': [(False, 'form')],
            'target': 'current',
        }


class HrExpenseSheet(models.Model):
    _inherit = 'hr.expense.sheet'

    def action_post_directly(self):
        """Post expense sheet directly to accounting and mark as done"""
        self.ensure_one()

        try:
            # Basic validation
            if not self.expense_line_ids:
                raise UserError(_("You cannot post an expense sheet without expenses."))

            # Set journal if not set
            if not self.journal_id:
                journal = self.env['account.journal'].search([
                    ('type', '=', 'purchase'),
                    ('company_id', '=', self.company_id.id)
                ], limit=1)
                if journal:
                    self.journal_id = journal.id
                else:
                    raise UserError(_("No purchase journal found"))

            # Check if employee has work contact
            if not self.employee_id.sudo().work_contact_id:
                raise UserError(_("Employee must have a work contact configured"))

            # Validate expense accounts
            for expense in self.expense_line_ids:
                if not expense.account_id:
                    raise UserError(_("Expense '%s' must have an account configured") % expense.name)

            # Set defaults (keep company_account since we set it as default)
            if not self.payment_mode:
                self.payment_mode = 'company_account'

            # Calculate accounting date
            if not self.accounting_date:
                self.accounting_date = fields.Date.context_today(self)

            # Set approval state and dates
            self.approval_state = 'approve'
            self.approval_date = fields.Date.context_today(self)

            # Use standard _do_create_moves but with proper context
            # Force the sheet into 'submit' state temporarily to pass the state check
            original_approval_state = self.approval_state
            self.approval_state = 'submit'

            try:
                # Call the standard method
                moves = self._do_create_moves()

                # Restore approval state
                self.approval_state = original_approval_state

                # Post the moves
                if moves:
                    moves.action_post()

                    # Set final state to done
                    self.write({'state': 'done'})

                    return True  # Success
                else:
                    raise UserError(_("No journal entries were created"))

            except Exception as move_error:
                # Restore approval state on error
                self.approval_state = original_approval_state
                raise UserError(_("Failed to create journal entries: %s") % str(move_error))

        except Exception as e:
            raise UserError(_("Direct posting failed: %s") % str(e))