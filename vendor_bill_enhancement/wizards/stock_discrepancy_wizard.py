# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class VendorBillStockDiscrepancyWizard(models.TransientModel):
    _name = 'vendor.bill.stock.discrepancy.wizard'
    _description = 'Vendor Bill Stock Discrepancy Resolution Wizard'

    vendor_bill_id = fields.Many2one(
        'account.move',
        string='Vendor Bill',
        required=True,
        readonly=True
    )

    discrepancy_details = fields.Text(
        string='Discrepancy Details',
        related='vendor_bill_id.stock_discrepancy_details',
        readonly=True
    )

    stock_picking_ids = fields.One2many(
        'stock.picking',
        related='vendor_bill_id.auto_stock_picking_ids',
        string='Related Stock Pickings',
        readonly=True
    )

    resolution_action = fields.Selection([
        ('revert_all', 'Revert All Stock Moves'),
        ('revert_last', 'Revert Only Last Stock Moves'),
        ('manual_adjust', 'Manual Inventory Adjustment'),
        ('ignore', 'Mark as Resolved (No Action)'),
    ], string='Resolution Action', required=True, default='revert_last')

    confirmation_text = fields.Char(
        string='Confirmation',
        help='Type "CONFIRM" to proceed with the selected action'
    )

    show_stock_moves = fields.Boolean(
        string='Show Stock Moves',
        compute='_compute_show_stock_moves'
    )

    @api.depends('stock_picking_ids')
    def _compute_show_stock_moves(self):
        for wizard in self:
            wizard.show_stock_moves = bool(wizard.stock_picking_ids)

    def action_resolve_discrepancy(self):
        """Execute the selected resolution action"""
        self.ensure_one()

        if self.confirmation_text != 'CONFIRM':
            raise UserError(_("Please type 'CONFIRM' to proceed with the resolution."))

        if not self.env.user.has_group('stock.group_stock_manager'):
            raise UserError(_("Only stock managers can resolve stock discrepancies."))

        if self.resolution_action == 'revert_all':
            self._revert_all_stock_moves()
        elif self.resolution_action == 'revert_last':
            self._revert_last_stock_moves()
        elif self.resolution_action == 'manual_adjust':
            return self._create_manual_adjustment()
        elif self.resolution_action == 'ignore':
            self._mark_as_resolved()

        # Clear discrepancy flags
        self.vendor_bill_id.write({
            'has_stock_discrepancy': False,
            'stock_discrepancy_details': False,
        })

        return {'type': 'ir.actions.act_window_close'}

    def _revert_all_stock_moves(self):
        """Revert all stock moves by creating return pickings"""
        pickings_to_revert = self.vendor_bill_id.auto_stock_picking_ids.filtered(
            lambda p: p.state == 'done'
        )

        if not pickings_to_revert:
            raise UserError(_("No completed stock pickings found to revert."))

        return_pickings = []
        for picking in pickings_to_revert:
            return_picking = self._create_return_picking(picking)
            return_pickings.append(return_picking)

        # Log the action
        self.vendor_bill_id.message_post(
            body=f"All stock moves reverted. Created {len(return_pickings)} return pickings.",
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        # Reset stock processing flags
        self.vendor_bill_id.write({
            'stock_moves_created': False,
            'stock_processed_hash': False,
        })

    def _revert_last_stock_moves(self):
        """Revert only the last stock moves"""
        last_picking = self.vendor_bill_id.auto_stock_picking_ids.sorted(
            'create_date', reverse=True
        ).filtered(lambda p: p.state == 'done')[:1]

        if not last_picking:
            raise UserError(_("No completed stock picking found to revert."))

        return_picking = self._create_return_picking(last_picking)

        # Log the action
        self.vendor_bill_id.message_post(
            body=f"Last stock moves reverted. Created return picking {return_picking.name}.",
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        # Update hash to previous state (simplified approach)
        remaining_pickings = self.vendor_bill_id.auto_stock_picking_ids - last_picking
        if not remaining_pickings:
            self.vendor_bill_id.write({
                'stock_moves_created': False,
                'stock_processed_hash': False,
            })

    def _create_return_picking(self, original_picking):
        """Create a return picking for the given original picking"""
        # Use Odoo's standard return picking wizard
        return_wizard = self.env['stock.return.picking'].with_context(
            active_id=original_picking.id,
            active_ids=[original_picking.id]
        ).create({})

        # Auto-confirm all lines for return
        for line in return_wizard.product_return_moves:
            line.quantity = line.move_id.product_uom_qty

        # Create the return picking
        result = return_wizard.create_returns()

        if result and 'res_id' in result:
            return_picking = self.env['stock.picking'].browse(result['res_id'])

            # Process the return picking automatically
            return_picking.action_confirm()
            return_picking.action_assign()
            return_picking.button_validate()

            return return_picking

        raise UserError(_("Failed to create return picking for %s") % original_picking.name)

    def _create_manual_adjustment(self):
        """Open inventory adjustment wizard"""
        # Get all products from the bill
        products = self.vendor_bill_id.invoice_line_ids.filtered(
            lambda line: line.product_id and line.product_id.type in ['product', 'consu']
        ).mapped('product_id')

        if not products:
            raise UserError(_("No stockable products found in the vendor bill."))

        # Get the stock location
        warehouse = self.env['stock.warehouse'].search([
            ('company_id', '=', self.vendor_bill_id.company_id.id)
        ], limit=1)

        if not warehouse:
            raise UserError(_("No warehouse found for company %s") % self.vendor_bill_id.company_id.name)

        # Create inventory adjustment
        inventory = self.env['stock.inventory'].create({
            'name': f'Manual Adjustment for Bill {self.vendor_bill_id.name}',
            'location_ids': [(4, warehouse.lot_stock_id.id)],
            'company_id': self.vendor_bill_id.company_id.id,
            'product_ids': [(6, 0, products.ids)],
        })

        # Log the action
        self.vendor_bill_id.message_post(
            body=f"Manual inventory adjustment created: {inventory.name}",
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        return {
            'type': 'ir.actions.act_window',
            'name': _('Manual Inventory Adjustment'),
            'res_model': 'stock.inventory',
            'view_mode': 'form',
            'res_id': inventory.id,
            'target': 'current',
        }

    def _mark_as_resolved(self):
        """Mark discrepancy as resolved without taking action"""
        self.vendor_bill_id.message_post(
            body="Stock discrepancy marked as resolved by user. No corrective action taken.",
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

    def action_view_stock_moves(self):
        """View all related stock moves"""
        moves = self.vendor_bill_id.auto_stock_picking_ids.mapped('move_ids')

        if not moves:
            raise UserError(_("No stock moves found for this vendor bill."))

        return {
            'type': 'ir.actions.act_window',
            'name': _('Related Stock Moves'),
            'res_model': 'stock.move',
            'view_mode': 'tree,form',
            'domain': [('id', 'in', moves.ids)],
            'target': 'current',
        }