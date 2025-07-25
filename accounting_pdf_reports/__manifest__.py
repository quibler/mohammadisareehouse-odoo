{
    'name': 'Odoo 18 Accounting Financial Reports',
    'version': '1.0.2',
    'category': 'Invoicing Management',
    'description': 'Accounting Reports For Odoo 18, Accounting Financial Reports, '
                   'Odoo 18 Financial Reports',
    'summary': 'Accounting Reports For Odoo 18',
    'sequence': '1',
    'author': 'Odoo Mates, Odoo SA',
    'license': 'LGPL-3',
    'company': 'Odoo Mates',
    'maintainer': 'Odoo Mates',
    'support': 'odoomates@gmail.com',
    'website': 'https://www.youtube.com/watch?v=yA4NLwOLZms',
    'depends': ['account'],
    'live_test_url': 'https://www.youtube.com/watch?v=yA4NLwOLZms',
    'data': [
        'security/ir.model.access.csv',
        'data/account_account_type.xml',
        'views/menu.xml',
        'views/ledger_menu.xml',
        'views/receivable_payable_ledgers.xml',
        'views/financial_report.xml',
        'views/settings.xml',
        'wizard/account_report_common_view.xml',
        'wizard/partner_ledger.xml',
        'wizard/general_ledger.xml',
        'wizard/trial_balance.xml',
        'wizard/balance_sheet.xml',
        'wizard/profit_and_loss.xml',
        'wizard/tax_report.xml',
        'wizard/aged_partner.xml',
        'wizard/journal_audit.xml',
        'report/report.xml',
        'report/report_partner_ledger.xml',
        'report/report_general_ledger.xml',
        'report/report_trial_balance.xml',
        'report/report_financial.xml',
        'report/report_tax.xml',
        'report/report_aged_partner.xml',
        'report/report_journal_audit.xml',
        'report/report_journal_entries.xml',
    ],
    'pre_init_hook': '_pre_init_clean_m2m_models',
    'images': ['static/description/banner.gif'],
}
