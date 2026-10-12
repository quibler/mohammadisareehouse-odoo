{
    'name': 'Kuwait Retail POS Suite',
    'summary': 'Complete retail POS solution for Kuwait clothing stores with auto barcode generation and SUPER FAST order processing',
    'description': """
        All-in-one Point of Sale solution for Kuwait retail clothing stores:

        🏪 RETAIL OPERATIONS
        • Default product settings optimized for retail (POS available, consumable type)
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
        • Smart quantity calculation from vendor bills
        🇰🇼⚡
        """,
    'author': 'Ashwini Kumar',
    'category': 'Point Of Sale',
    'version': '18.0.5.1.3',  # Remove brand QR code from POS receipt
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
        'views/product_views.xml',
        'views/product_label_layout_views.xml',
        'views/product_label_templates.xml',
        'views/product_template_common_form_views.xml',

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
    },
    'license': 'Other proprietary',
    'application': False,
    'installable': True,
    'auto_install': False,
}