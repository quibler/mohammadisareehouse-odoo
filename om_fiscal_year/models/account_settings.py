from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    fiscalyear_last_day = fields.Integer(
        related='company_id.fiscalyear_last_day', readonly=False
    )
    fiscalyear_last_month = fields.Selection(
        related='company_id.fiscalyear_last_month', readonly=False
    )
    tax_lock_date = fields.Date(
        string="Tax Hard Lock Date",  # This won't break anything
        related='company_id.hard_lock_date', readonly=False
    )
    sale_lock_date = fields.Date(
        string="Sales Hard Lock Date",  # Safe to add
        related='company_id.hard_lock_date', readonly=False
    )
    purchase_lock_date = fields.Date(
        string="Purchase Hard Lock Date",  # Safe to add
        related='company_id.hard_lock_date', readonly=False
    )
    hard_lock_date = fields.Date(
        string="General Hard Lock Date",  # Safe to add
        related='company_id.hard_lock_date', readonly=False
    )
    fiscalyear_lock_date = fields.Date(
        related='company_id.fiscalyear_lock_date', readonly=False
    )
    group_fiscal_year = fields.Boolean(
        string='Fiscal Years', implied_group='om_fiscal_year.group_fiscal_year'
    )
