{
    'name': 'Auto Stock Update from Vendor Bills',
    'version': '18.0.1.0.0',
    'category': 'Inventory/Purchase',
    'summary': 'Automatically update stock when vendor bills are validated',
    'description': """
        This module automatically creates stock movements and updates inventory
        when vendor bills are validated, eliminating the need for separate receipt validation.

        Features:
        - Auto-create stock pickings from vendor bills
        - Integration with existing purchase orders
        - Only processes stockable products
        - Proper inventory valuation handling
        - Error notifications for failed stock operations
    """,
    'author': 'Custom Development',
    'depends': [
        'account',
        'stock',
        'purchase',
        'purchase_stock',
    ],
    'data': [
        'views/account_move_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}