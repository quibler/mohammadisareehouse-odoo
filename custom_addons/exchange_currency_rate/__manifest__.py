# -*- coding: utf-8 -*-
{
    'name': "Manual Currency Exchange Rate",
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': "Manual currency rate input for invoices and bills",
    'description': """
Manual Currency Exchange Rate
=============================

Lightweight manual currency rate management:

* Manual rate input in Customer Invoices and Vendor Bills
* Automatic updates to global currency rates (res.currency.rate)
* Auto-populates with last entered rate for convenience
* Direct company_rate field mapping (foreign currency per company currency)
* Minimal dependencies - only requires base and account modules

Perfect for businesses that need manual control over exchange rates in accounting!
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['base', 'account'],
    'data': [
        'views/account_move_views.xml',
    ],
    'images': ['static/description/banner.png'],
    'license': 'AGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}