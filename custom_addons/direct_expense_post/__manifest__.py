{
    'name': 'Direct Expense Posting',
    'version': '1.0',
    'category': 'Human Resources/Expenses',
    'summary': 'Post expenses directly to accounting without approval workflow',
    'description': """
        This module allows retail shop owners and small businesses to post expenses 
        directly to accounting without going through the standard approval workflow.
        
        Features:
        - Add "Post Directly" button on expense forms
        - Bypass submit/approve workflow
        - Direct journal entry creation
        - Simplified expense management for small businesses
    """,
    'depends': ['hr_expense', 'account'],
    'data': [
        'views/hr_expense_views.xml',
        'security/ir.model.access.csv',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}