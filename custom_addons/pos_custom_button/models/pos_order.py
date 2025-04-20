# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from markupsafe import Markup

class PosOrder(models.Model):
    _inherit = 'pos.order'

    sales_person_id = fields.Many2one('hr.employee', string='POS Sales person')

    def _prepare_invoice_vals(self):
        vals = super()._prepare_invoice_vals()
        vals.update({
            'pos_sales_person_id': self.sales_person_id.id
        })
        return vals