{
    'name': 'Direct Expense Posting & Payment',
    'version': '1.1',
    'category': 'Human Resources/Expenses',
    'summary': 'Mark expenses as paid in one click - bypass approval workflow',
    'description': """
        Enhanced Direct Expense Posting for Small Businesses

        This module allows retail shop owners and small businesses to process expenses 
        instantly without going through the standard approval workflow.

        Features:
        - "Mark as Paid" button on expense forms
        - Complete workflow automation: Create Report → Submit → Approve → Post Journal Entry → Register Payment → Mark as Done
        - Automatic journal entry creation and posting
        - Automatic payment registration and reconciliation
        - Support for both employee-paid and company-paid expenses
        - Simplified expense management for small businesses
        - Visual indicators for paid expenses

        Workflow:
        Standard: Draft → Submit → Approve → Post → Pay → Done
        Direct: Draft → Done (Paid) - All in one click!

        Perfect for small businesses that need quick expense processing without approval bottlenecks.
    """,
    'depends': ['hr_expense', 'account'],
    'data': [
        'views/hr_expense_views.xml',
        'security/ir.model.access.csv',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
}