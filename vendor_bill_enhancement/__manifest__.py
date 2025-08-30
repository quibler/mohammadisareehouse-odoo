{
    'name': 'Vendor Bill Enhancement Suite',
    'version': '18.0.3.0.0',  # Increment version for proper stock moves implementation
    'category': 'Inventory/Purchase',
    'summary': 'Enhanced vendor bill processing with proper stock moves, discrepancy resolution, and cost management',
    'description': """
        Enhanced vendor bill processing with comprehensive automation features and proper stock move integration.
        Streamlines inventory management and cost tracking for better business efficiency.

        Key Features:
        - Auto-create proper stock pickings from vendor bills with full traceability
        - Smart discrepancy detection and resolution wizard
        - Product cost price updates with configurable strategies
        - Quick product label printing with bill quantities
        - Default bill date automation (today's date)
        - Integration with existing purchase workflows
        - Currency conversion for accurate cost calculations
        - Comprehensive error handling and audit trails
        - Only processes stockable products for safety
        - Proper stock move creation following Odoo standards
        - Reversible stock operations with full audit trail
        - Real-time inventory valuation updates
        - Clean warning messages without HTML tags
    """,
    'author': 'Custom Development',
    'depends': [
        'account',
        'stock',
        'product',
        'pos_kuwait_retail',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/account_move_views.xml',
        'views/stock_discrepancy_wizard_views.xml',
        'views/menu_customization.xml',
        'data/ir_config_parameter.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}