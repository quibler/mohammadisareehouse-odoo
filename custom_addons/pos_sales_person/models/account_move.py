from odoo import models, fields


class AccountMove(models.Model):
    _inherit = 'account.move'

    sales_person_id = fields.Many2one(
        'hr.employee',
        string='Sales Person',
        help="Employee who handled this sale (from POS)",
        readonly=True
    )

    global_discount_amount = fields.Float(
        string='Global Discount Amount',
        help="Fixed amount discount applied to the order",
        readonly=True
    )

    global_discount_type = fields.Selection([
        ('percentage', 'Percentage'),
        ('amount', 'Fixed Amount')
    ], string='Global Discount Type', readonly=True)