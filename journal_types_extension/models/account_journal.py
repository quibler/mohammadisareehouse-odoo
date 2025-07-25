from odoo import models, fields, api


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    # Extend the type selection field to include new types
    type = fields.Selection([
        ('sale', 'Sales'),
        ('purchase', 'Purchase'),
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('credit', 'Credit Card'),
        ('general', 'Miscellaneous'),
        ('expense', 'Expense'),
        ('inventory', 'Inventory'),
    ], required=True,
        help="""
    Select 'Sale' for customer invoices journals.
    Select 'Purchase' for vendor bills journals.
    Select 'Cash', 'Bank' or 'Credit Card' for journals that are used in customer or vendor payments.
    Select 'General' for miscellaneous operations journals.
    Select 'Expense' for manual miscellaneous expense entries.
    Select 'Inventory' for tracking inventory movements.
    """)

    def _get_default_account_domain(self):
        """Override to handle new journal types"""
        domain = super()._get_default_account_domain()

        # For expense journals - manual miscellaneous expenses
        if self.type == 'expense':
            return """[
                ('deprecated', '=', False),
                ('account_type', 'in', ('expense', 'expense_depreciation', 'expense_direct_cost'))
            ]"""

        # For inventory journals - tracking inventory movements
        elif self.type == 'inventory':
            return """[
                ('deprecated', '=', False),
                ('account_type', 'in', ('asset_current', 'expense_direct_cost'))
            ]"""

        return domain