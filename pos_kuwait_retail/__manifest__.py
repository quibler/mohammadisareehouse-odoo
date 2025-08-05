{
    'name': 'Kuwait Retail POS Suite',
    'summary': 'Complete retail POS solution for Kuwait clothing stores with auto barcode generation and SUPER FAST order processing',
    'description': """
        All-in-one Point of Sale solution for Kuwait retail clothing stores:

        🏪 RETAIL OPERATIONS
        • Auto barcode generation from product names (uppercase, 25 chars max)
        • Default product settings optimized for retail (POS available, consumable type)
        • Simplified label printing with Dymo support
        • Smart product cost updates from vendor bills

        👤 SALES MANAGEMENT  
        • Sales person tracking on all orders and receipts
        • Sales person restrictions per POS terminal
        • Sales analytics and reporting

        ⚡ SUPER FAST ORDER PROCESSING
        • Lightning-fast keyboard shortcuts for quantity changes
        • Arrow keys ↑↓ or +/- for increment/decrement
        • Price-focused numpad (default to Price vs Quantity)
        • One-click Refund button in numpad area

        💰 PRICING & EFFICIENCY
        • Price button gets focus by default for faster pricing
        • Quick line deletion with X buttons
        • Clean receipt format optimized for Kuwait retail

        📧 CUSTOM EMAIL RECEIPTS
        • Customized email receipt template for Mohammadi saree house
        • Professional email formatting with WhatsApp contact info
        • Simple subject line: "Receipt"

        📊 REPORTING & COMPLIANCE
        • Simplified daily sales reports (no taxes/discounts for Kuwait)
        • Sales person performance analytics
        • Clean session reports

        🇰🇼 KUWAIT OPTIMIZED
        • No tax calculations (Kuwait retail compliant)
        • Arabic-friendly interface
        • Local business workflow optimization
        • Optimized for high-volume retail operations

        ⚡ SPEED BENEFITS:
        - 80% faster quantity adjustments
        - Instant refund access
        - Keyboard power-user support
        - Touch-friendly mobile interface

        Perfect for high-volume clothing stores, boutiques, and retail shops in Kuwait!

        🏷️ LABEL PRINTING FEATURES:
        • Custom price input for labels - override default pricing
        • All standard layout options restored (2x7, 4x7, 4x12, etc.)
        • Smart quantity calculation from vendor bills
        🇰🇼⚡
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.5.0.0',  # Version bump for custom price feature
    'depends': [
        'point_of_sale',
        'pos_hr',
        'product',
        'stock',
        'account'
    ],
    'data': [
        # Core configuration
        'views/pos_config_views.xml',
        'views/res_config_settings_views.xml',

        # Product & barcode management
        'views/product_label_layout_views.xml',
        'views/product_label_templates.xml',  # NEW: Custom price templates
        'data/product_label_reports.xml',
        'data/dymo_paper_format.xml',

        # Sales person & order management
        'views/pos_order_views.xml',
        'views/account_move_views.xml',

        # Reporting
        'views/pos_session_sales_details.xml',
        'report/pos_report_views.xml',
        'report/top_sales_person_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_kuwait_retail/static/src/**/*',
        ],
        'web.assets_common': [
            'pos_kuwait_retail/static/src/css/label_print_fix.css',  # Fix faded label fonts
        ],
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}