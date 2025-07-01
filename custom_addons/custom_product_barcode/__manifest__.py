# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Custom Product Barcode Generation",
    'summary': """
        Automatically generates barcodes from product names for all products.
    """,
    'description': """
        This module generates barcodes from product names instead of sequences:
        - Automatically updates ALL existing products during installation
        - Future products get name-based barcodes automatically
        - Truncates names to 25 characters for barcode compatibility
        - Handles duplicates by appending numbers
        - Uses fallback format PROD_{ID} for empty names
        - Updates barcodes when product names change
    """,
    'author': "Your Name/Company",
    'website': "https://www.yourcompany.com",
    'category': 'Inventory/Inventory',
    'version': '18.0.2.0.0',  # Incremented version for the update
    'depends': ['stock', 'product'],
    'data': [
        'views/product_label_report.xml',
    ],
    'post_init_hook': 'post_init_hook',  # This runs after module installation
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}