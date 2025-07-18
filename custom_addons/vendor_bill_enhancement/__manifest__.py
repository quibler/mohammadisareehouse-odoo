{
    'name': 'Vendor Bill Enhancement Suite',
    'version': '18.0.2.0.0',  # Increment version for major naming change
    'category': 'Inventory/Purchase',
    'summary': 'Comprehensive vendor bill enhancements: auto stock updates, cost management, and label printing',
    'description': """
        Enhanced vendor bill processing with comprehensive automation features.
        Streamlines inventory management and cost tracking for better business efficiency.

        Key Features:
        - Auto-create stock pickings from vendor bills
        - Smart product cost price updates with configurable strategies
        - Quick product label printing with bill quantities
        - Default bill date automation (today's date)
        - Integration with existing purchase workflows
        - Currency conversion for accurate cost calculations
        - Comprehensive error handling and audit trails
        - Only processes stockable products for safety
        - Configurable cost update strategies per product category
        - Real-time inventory valuation updates
    """,
    'author': 'Custom Development',
    'depends': [
        'account',
        'stock',
        'purchase',
        'purchase_stock',
        'product',  # This includes the label printing functionality
        'pos_kuwait_retail',
    ],
    'data': [
        'views/account_move_views.xml',
        'views/product_category_views.xml',
        'views/menu_customization.xml',
        'data/ir_config_parameter.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}