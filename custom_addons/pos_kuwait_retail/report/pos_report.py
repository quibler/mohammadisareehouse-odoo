# -*- coding: utf-8 -*-
from odoo import fields, models, api

class PosOrderReport(models.Model):
    _inherit = "report.pos.order"

    sales_person_id = fields.Many2one('hr.employee', string='Sales Person', readonly=True)

    def _select(self):
        select_str = super()._select()
        # Add sales_person_id from pos_order (aliased as 's' in the original query)
        return select_str + ",\n                s.sales_person_id AS sales_person_id"