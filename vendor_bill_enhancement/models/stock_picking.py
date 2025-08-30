# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    vendor_bill_id = fields.Many2one(
        'account.move',
        string='Vendor Bill',
        readonly=True,
        help="Vendor bill that automatically created this stock picking"
    )

    def action_view_vendor_bill(self):
        """Action to view the related vendor bill"""
        self.ensure_one()
        if not self.vendor_bill_id:
            return

        return {
            'type': 'ir.actions.act_window',
            'name': _('Related Vendor Bill'),
            'res_model': 'account.move',
            'view_mode': 'form',
            'res_id': self.vendor_bill_id.id,
            'target': 'current',
        }