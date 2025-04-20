{
    'name': 'POS Sales Person',
    'summary': 'Record sales person on pos order',
    'description': """
        Record sales person on pos order
        """,
    'author': 'Yoni Tji',
    'category': 'Point Of Sale',
    'version': '18.0.1.0.0',
    'depends': ['account', 'point_of_sale', 'pos_hr'],
    'data': [
        'views/account_move_views.xml',
        'views/pos_order_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale.assets_pos': [
            'pos_sales_person/static/src/app/**/*',
        ],
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}