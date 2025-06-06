{
    'name': 'POS Brand QR Code',
    'summary': 'Add fixed QR code linking to brand pages on POS receipts',
    'description': """
        This module adds a fixed QR code to POS receipts that links to your brand pages.
        The QR code can be configured in POS settings and appears on all receipts.
        """,
    'author': 'Your Company',
    'category': 'Point Of Sale',
    'version': '18.0.1.0.0',
    'depends': ['point_of_sale'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_brand_qr/static/src/**/*',
        ],
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}