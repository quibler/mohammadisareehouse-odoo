{
    'name': "Custom Product Barcode Generation",
    'summary': """
        Automatically generates Code128 barcodes for products if not provided.
    """,
    'description': """
        This module overrides the create method of product.product to assign
        an automatically generated Code128 barcode if the barcode field is empty upon creation.
        It uses an Odoo sequence for generating unique alphanumeric barcodes.
        Supports existing barcode formats like "269-35778 RW".
    """,
    'author': "Your Name/Company",
    'website': "https://www.yourcompany.com",
    'category': 'Inventory/Inventory',
    'version': '18.0.1.0.0',
    'depends': ['stock', 'product'],
    'data': [
        'data/ir_sequence_data.xml',
        'views/product_label_report.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}