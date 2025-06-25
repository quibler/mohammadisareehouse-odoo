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

    def _prepare_refund_values(self, current_session):
        """Override to inherit sales_person_id from original order to refund

        Note: This method is primarily used for backend refunds.
        POS refunds are handled by the frontend via addAdditionalRefundInfo().
        """
        vals = super()._prepare_refund_values(current_session)

        # Add sales_person_id from the original order to the refund
        if self.sales_person_id:
            vals['sales_person_id'] = self.sales_person_id.id

        return vals