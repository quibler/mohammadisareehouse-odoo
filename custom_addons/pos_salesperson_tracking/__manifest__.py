{
    'name': 'POS Salesperson Tracking',
    'version': '1.0',
    'category': 'Point of Sale',
    'summary': 'Track salesperson performance in POS',
    'description': """
        This module adds salesperson tracking to Point of Sale orders.
        - Select a salesperson during order creation in POS
        - View salesperson performance reports
        - Track commission and sales metrics by salesperson
    """,
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'depends': ['point_of_sale', 'hr'],
    'data': [
        'views/pos_order_views.xml',
        'report/salesperson_report_views.xml',
        'security/ir.model.access.csv',
    ],
    'assets': {
        'point_of_sale.assets': [
            'pos_salesperson_tracking/static/src/js/models.js',
            'pos_salesperson_tracking/static/src/js/SetSalespersonButton.js',
            'pos_salesperson_tracking/static/src/xml/OrderReceipt.xml',
            'pos_salesperson_tracking/static/src/xml/SetSalespersonButton.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}