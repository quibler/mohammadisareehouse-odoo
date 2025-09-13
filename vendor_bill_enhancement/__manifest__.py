{
    'name': 'Vendor Bill Enhancement Suite',
    'version': '18.0.4.2.0',  # Feature restoration: cost price auto-update + total product quantity UI
    'category': 'Inventory/Purchase',
    'summary': 'Streamlined vendor bill processing with automatic differential stock moves and cost updates',
    'description': """
        Streamlined vendor bill processing with intelligent automation that works behind the scenes.
        Automatically handles stock movements and cost updates without user intervention.

        Key Features:
        - Automatic stock moves creation on vendor bill posting
        - Intelligent differential processing - only creates moves for actual changes
        - Seamless handling of bill modifications (qty changes, product additions/removals)
        - Automatic product cost price updates from latest bills
        - Default bill date automation (today's date)
        - Clean, minimal user interface with essential information only
        - Simple line numbering for easy reference
        - Robust error handling with informative messages
        - Full Odoo 18 compatibility with standard stock patterns
        - No manual intervention required - everything happens automatically
    """,
    'author': 'Custom Development',
    'depends': [
        'account',
        'stock',
        'product',
        'pos_kuwait_retail',
    ],
    'data': [
        'views/account_move_views.xml',
        'views/menu_customization.xml',
        'data/ir_config_parameter.xml',
    ],
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}