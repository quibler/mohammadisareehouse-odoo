{
    'name': 'Mohammadi Saree House - Complete Suite Installer',
    'summary': 'One-click installer for all Mohammadi Saree House custom modules in proper dependency order',
    'description': """
        Complete Suite Installer for Mohammadi Saree House
        
        This meta-module automatically installs all custom addons in the correct dependency order:
        
        🏪 POINT OF SALE
        • Kuwait Retail POS Suite - Complete POS solution with barcode generation and custom receipts
        
        💼 ACCOUNTING & FINANCE
        • Accounting PDF Reports - Professional financial reports
        • Assets Management - Fixed asset tracking and depreciation
        • Budget Management - Budget planning and control
        • Daily Reports - Cash book, day book, bank book reports
        • Customer Follow-up - Automated payment reminders
        • Fiscal Year Management - Custom fiscal periods and lock dates
        • Recurring Payments - Automated recurring transactions
        • Complete Accountant Suite - Full accounting functionality
        
        💱 CURRENCY & BILLING
        • Manual Currency Exchange Rate - Custom exchange rates for vendor bills
        • Vendor Bill Enhancement - Enhanced vendor bill processing with POS integration
        
        💰 EXPENSE MANAGEMENT
        • Direct Expense Posting - Streamlined expense workflow
        
        🎨 USER INTERFACE
        • MuK Backend Theme - Modern, professional interface
        • MuK AppsBar - Enhanced app navigation
        • MuK Chatter - Improved communication features
        • MuK Colors - Customizable color schemes
        • MuK Dialog - Enhanced dialog boxes
        
        All modules are installed automatically in the correct dependency order to ensure
        proper functionality and avoid installation conflicts.
        
        Perfect for complete Mohammadi Saree House ERP setup with one click.
    """,
    'author': 'Mohammadi Saree House',
    'category': 'Tools',
    'version': '18.0.1.0.0',
    'depends': [
        # Core Odoo dependencies needed first
        'base',
        'web',
        
        # Level 1 - Base modules (no internal dependencies)
        'accounting_pdf_reports',
        'muk_web_appsbar',
        'muk_web_chatter',
        'muk_web_colors',
        'muk_web_dialog',
        'om_account_asset',
        'om_account_budget',
        'om_fiscal_year',
        'om_recurring_payments',
        'om_account_followup',
        'direct_expense_post',
        'exchange_currency_rate',
        'pos_kuwait_retail',
        
        # Level 2 - Modules with Level 1 dependencies
        'muk_web_theme',
        'om_account_daily_reports',
        
        # Level 3 - Modules with Level 1-2 dependencies
        'vendor_bill_enhancement',
        
        # Level 4 - Meta modules (depends on multiple previous levels)
        'om_account_accountant',
    ],
    'data': [],
    'license': 'Other proprietary',
    'application': True,
    'installable': True,
    'auto_install': False,
}