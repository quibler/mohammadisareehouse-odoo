{
    'name': 'Auto Stock Update from Vendor Bills with Cost Price Updates',
    'version': '18.0.1.1.0',
    'category': 'Inventory/Purchase',
    'summary': 'Automatically update stock and product cost prices when vendor bills are validated',
    'description': """
        This module automatically creates stock movements and updates inventory
        when vendor bills are validated, eliminating the need for separate receipt validation.

        NEW: Also automatically updates product cost prices from vendor bill unit prices.

        Features:
        - Auto-create stock pickings from vendor bills
        - AUTO-UPDATE PRODUCT COST PRICES from vendor bill unit prices
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
        'product',
    ],
    'data': [
        'views/account_move_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}