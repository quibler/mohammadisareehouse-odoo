{
    'name': 'POS Kuwait Retail Enhancements',
    'summary': 'Complete POS customizations for Kuwait retail clothing store operations',
    'description': """
        Comprehensive Point of Sale module tailored for retail clothing stores in Kuwait:

        Sales Person Features:
        - Record and track sales person on POS orders
        - Display in reports and track individual sales performance
        - Configure allowed sales persons per POS configuration
        - Sales person-based reporting and analytics

        Price Management Features:
        - Set default numpad focus to Price button instead of Quantity
        - Optimized for retail environments where price adjustments are common
        - Maintains all standard POS functionality

        Label & Printing Features:
        - Simplified label layout options (Dymo and Dymo without price)
        - Custom Dymo label template without price display
        - Streamlined label printing for retail operations

        Report Customizations:
        - Custom Daily Sales Report titles (Mid-Session / Session Closing)
        - Enhanced reporting with sales person analytics
        - Retail-focused report layouts

        Kuwait Business Compliance:
        - Designed for Kuwait retail operations
        - Supports local business requirements
        - Arabic-friendly interface elements

        Perfect for clothing stores, boutiques, and retail operations in Kuwait.
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.1.23.0',
    'depends': ['account', 'point_of_sale', 'pos_hr', 'product'],
    'data': [
        'views/account_move_views.xml',
        'views/pos_order_views.xml',
        'views/pos_config_views.xml',
        'views/res_config_settings_views.xml',
        'views/product_label_layout_views.xml',
        'views/pos_session_sales_details.xml',  # New: Custom report titles
        'report/pos_report_views.xml',
        'report/top_sales_person_views.xml',
        'data/product_label_reports.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_kuwait_retail/static/src/**/*',
        ],
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}