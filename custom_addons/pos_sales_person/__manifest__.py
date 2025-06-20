{
    'name': 'POS Sales Person & Price Focus',
    'summary': 'Record sales person on POS order and set default price focus',
    'description': """
        Enhanced Point of Sale module that provides:

        Sales Person Features:
        - Record sales person on POS orders
        - Display in reports and track individual sales performance
        - Configure allowed sales persons per POS

        Price Focus Features:
        - Set default numpad focus to Price button instead of Quantity
        - Optimized for retail environments where price adjustments are common
        - Maintains all standard POS functionality

        Perfect for retail clothing stores in Kuwait and similar operations.
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.1.1.0',  # Updated version
    'depends': ['account', 'point_of_sale', 'pos_hr'],
    'data': [
        'views/account_move_views.xml',
        'views/pos_order_views.xml',
        'views/res_config_settings_views.xml',
        'report/pos_report_views.xml',
        'report/top_sales_person_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_sales_person/static/src/**/*',
        ],
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}