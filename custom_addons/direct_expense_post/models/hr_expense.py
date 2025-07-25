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

            # Continue with the rest of your existing action_post_directly method
            # (The rest of the method content should remain as it was)

        except Exception as e:
            raise UserError(_("Error processing expense: %s") % str(e))