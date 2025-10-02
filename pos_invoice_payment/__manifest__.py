{
    'name': 'POS Invoice Payment',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Register customer invoice payments from POS interface',
    'description': """
        POS Invoice Payment
        ===================

        Allow POS users to register payments for customer invoices without accounting access.

        Features:
        * View customer invoices in POS interface
        * Register full or partial payments
        * Print thermal receipts for invoice payments
        * No POS order creation - direct payment registration
        * Uses Odoo's standard payment reconciliation
        * Session balance compatible

        UI:
        * New "Invoices" menu item (similar to Orders)
        * Invoice list with search and filter
        * Invoice details panel
        * Standard POS payment screen integration
    """,
    'author': 'Custom',
    'depends': [
        'point_of_sale',
        'account',
    ],
    'data': [
        'security/ir.model.access.csv',
        'security/ir_rule.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_invoice_payment/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
