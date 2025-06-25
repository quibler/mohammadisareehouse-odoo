{
    'name': 'Custom POS',
    'summary': 'Enhanced Point of Sale with Sales Person tracking, Price Focus, and Amount-based Global Discounts',
    'description': """
        Enhanced Point of Sale module specifically designed for retail clothing stores with comprehensive features:

        Sales Person Features:
        - Record sales person on POS orders
        - Display in reports and track individual sales performance
        - Configure allowed sales persons per POS configuration
        - Top sales person reporting

        Price Focus Features:
        - Set default numpad focus to Price button instead of Quantity
        - Optimized for retail environments where price adjustments are common
        - Maintains all standard POS functionality

        Global Discount Features:
        - Amount-based global discount (instead of percentage-only)
        - Support for both percentage and fixed amount discounts
        - Kuwait Dinar (KWD) currency optimization
        - Enhanced discount calculation for clothing retail

        Perfect for retail clothing stores in Kuwait and similar operations requiring:
        - Individual sales tracking
        - Flexible pricing controls
        - Amount-based discount capabilities
        - Multi-outlet management
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.2.0.0',
    'depends': ['account', 'point_of_sale', 'pos_hr', 'pos_discount'],
    'data': [
        'views/account_move_views.xml',
        'views/pos_order_views.xml',
        'views/res_config_settings_views.xml',
        'report/pos_report_views.xml',
        'report/top_sales_person_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'custom_pos/static/src/**/*',
        ],
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}