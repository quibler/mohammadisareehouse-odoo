# -*- coding: utf-8 -*-
{
    'name': 'Sale Order Customer Filter',
    'version': '1.0',
    'category': 'Sales',
    'summary': 'Filter sale orders by customer',
    'description': """
        This module adds customer filtering functionality to sale orders.
    """,
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'depends': ['sale'],
    'data': [
        'views/sale_order_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}