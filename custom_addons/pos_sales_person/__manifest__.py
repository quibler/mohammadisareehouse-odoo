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

        Label Layout Features:
        - Simplified label layout options (Dymo and Dymo without price only)
        - Custom Dymo label template without price display
        - Streamlined label printing for retail operations

        Perfect for retail clothing stores in Kuwait and similar operations.
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.1.22.0',  # Force field cache clear with static selection
    'depends': ['account', 'point_of_sale', 'pos_hr', 'product'],  # Added 'product' dependency
    'data': [
        'views/account_move_views.xml',
        'views/pos_order_views.xml',
        'views/res_config_settings_views.xml',
        'views/product_label_layout_views.xml',  # Added view override with correct ID
        'report/pos_report_views.xml',
        'report/top_sales_person_views.xml',
        'data/product_label_reports.xml',  # Added label reports
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