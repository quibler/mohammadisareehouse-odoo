from odoo import models, fields


class PosConfig(models.Model):
    _inherit = 'pos.config'

    require_employee = fields.Boolean(
        string='Require Sales Associate',
        help='If checked, a sales associate must be selected for each transaction',
        default=True
    )