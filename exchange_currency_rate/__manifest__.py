# -*- coding: utf-8 -*-
{
    'name': "Manual Currency Exchange Rate - Vendor Bills",
    'version': '18.0.1.1.0',
    'category': 'Accounting',
    'summary': "Manual currency rate input for vendor bills with company currency totals",
    'description': """
Manual Currency Exchange Rate for Vendor Bills
==============================================

Focused currency rate management for vendor bills:

* Manual rate input in Vendor Bills only
* Automatic updates to global currency rates (res.currency.rate)
* Auto-populates with last entered rate for convenience
* Display totals in both foreign and company currency
* Company currency total display in totals section
* Clean, focused functionality for vendor bill management

Perfect for businesses that need manual control over exchange rates for vendor bills!
    """,
    'author': 'Cybrosys Techno Solutions',
    'company': 'Cybrosys Techno Solutions',
    'maintainer': 'Cybrosys Techno Solutions',
    'website': 'https://www.cybrosys.com',
    'depends': ['base', 'account'],  # Removed 'purchase' and 'sale_management'
    'data': [
        'views/account_move_views.xml',  # Only vendor bill views
    ],
    'images': ['static/description/banner.png'],
    'license': 'AGPL-3',
    'installable': True,
    'auto_install': False,
    'application': False,
}