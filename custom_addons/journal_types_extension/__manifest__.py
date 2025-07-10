{
    'name': 'Journal Types Extension',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Add custom journal types for manual expenses and inventory tracking',
    'description': """
        This module extends the standard journal types in Odoo 18 to include:
        - Expense: For manual miscellaneous expense entries
        - Inventory: For tracking inventory movements

        Specifically designed for retail clothing store operations in Kuwait.
    """,
    'author': 'Custom Development',
    'depends': ['account', 'stock'],
    'data': [
        'views/account_journal_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}