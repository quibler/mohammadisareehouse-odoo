{
    'name': "Custom Product Barcode Generation",
    'summary': """
        Automatically generates a barcode for products if not provided.
    """,
    'description': """
        This module overrides the create method of product.product to assign
        an automatically generated barcode if the barcode field is empty upon creation.
        It uses an Odoo sequence for generating unique barcodes.
    """,
    'author': "Your Name/Company",
    'website': "https://www.yourcompany.com", # Optional
    'category': 'Inventory/Inventory',
    'depends': ['stock'], # Depends on the inventory/stock module
    'data': [
        'data/ir_sequence_data.xml', # We'll create this file next
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}