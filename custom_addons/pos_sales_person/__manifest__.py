{
    'name': 'POS Sales Person',
    'summary': 'Record sales person on POS order',
    'description': """
        Record sales person on POS order and display in reports.
        Track individual sales performance in the Point of Sale.
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.1.0.0',
    'depends': ['account', 'point_of_sale', 'pos_hr'],
    'data': [
        'views/account_move_views.xml',
        'views/pos_order_views.xml',
        'views/res_config_settings_views.xml',
        'report/pos_report_views.xml',
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