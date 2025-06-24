# -*- coding: utf-8 -*-
{
    'name': "Manual Currency Exchange Rate",
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': "Manual currency rate input with automatic global rate updates",
    'description': """
Manual Currency Exchange Rate
=============================

Simple and reliable manual currency rate management:

* Manual rate input in Sales Orders, Purchase Orders, and Invoices
* Automatic updates to global currency rates (res.currency.rate)
* Auto-populates with last entered rate for convenience
* Direct company_rate field mapping (foreign currency per company currency)
* Clean, focused functionality without complex dependencies

Perfect for businesses that need manual control over exchange rates!
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['base', 'purchase', 'sale_management', 'account'],
    'data': [
        'views/sale_order_views.xml',
        'views/purchase_order_views.xml',
        'views/account_move_views.xml',
    ],
    'images': ['static/description/banner.png'],
    'license': 'AGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}