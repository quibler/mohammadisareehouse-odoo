{
    'name': 'Auto Stock Update from Vendor Bills with Cost Price Updates',
    'version': '18.0.1.2.0',  # Increment version
    'category': 'Inventory/Purchase',
    'summary': 'Automatically update stock, cost prices, and print product labels from vendor bills',
    'description': """
        This module automatically creates stock movements and updates inventory
        when vendor bills are validated, eliminating the need for separate receipt validation.

        Features:
        - Auto-create stock pickings from vendor bills
        - Auto-update product cost prices from vendor bill unit prices
        - PRINT PRODUCT LABELS with quantities from vendor bill lines
        - Integration with existing purchase orders
        - Only processes stockable products
        - Proper inventory valuation handling
        - Configurable cost update strategies per product category
        - Currency conversion for cost prices
        - Error notifications for failed operations
        - Audit trail of cost price changes
    """,
    'author': 'Custom Development',
    'depends': [
        'account',
        'stock',
        'purchase',
        'purchase_stock',
        'product',  # This includes the label printing functionality
    ],
    'data': [
        'views/account_move_views.xml',
        'views/product_category_views.xml',
        'data/ir_config_parameter.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}