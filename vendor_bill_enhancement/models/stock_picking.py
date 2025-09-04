# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    # Simple reference to vendor bill for traceability
    vendor_bill_reference = fields.Char(
        string='Vendor Bill Reference',
        readonly=True,
        help="Reference to vendor bill that created this stock picking"
    )

    def action_view_vendor_bill(self):
        """Action to view the related vendor bill if reference exists"""
        self.ensure_one()
        
        if not self.vendor_bill_reference:
            return
        
        # Find bill by name/reference
        bill = self.env['account.move'].search([
            ('name', '=', self.vendor_bill_reference),
            ('move_type', '=', 'in_invoice')
        ], limit=1)
        
        if not bill:
            return
        
        return {
            'type': 'ir.actions.act_window',
            'name': _('Related Vendor Bill'),
            'res_model': 'account.move',
            'view_mode': 'form',
            'res_id': bill.id,
            'target': 'current',
        }