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

    def write(self, vals):
        """Override to trigger vendor bill discrepancy recalculation when relevant fields change"""
        result = super().write(vals)
        
        # If state changes or return_id is set, update related vendor bills
        if 'state' in vals or 'return_id' in vals:
            vendor_bills = self.mapped('vendor_bill_id').filtered(bool)
            if vendor_bills:
                # Trigger recomputation of discrepancy status
                for bill in vendor_bills:
                    bill._compute_has_stock_discrepancy()
                    bill._compute_auto_stock_picking_count()
        
        return result

    @api.model_create_multi
    def create(self, vals_list):
        """Override to trigger vendor bill updates when new pickings are created"""
        pickings = super().create(vals_list)
        
        # Update vendor bills when new pickings are created
        vendor_bills = pickings.mapped('vendor_bill_id').filtered(bool)
        if vendor_bills:
            for bill in vendor_bills:
                bill._compute_has_stock_discrepancy()
                bill._compute_auto_stock_picking_count()
        
        return pickings