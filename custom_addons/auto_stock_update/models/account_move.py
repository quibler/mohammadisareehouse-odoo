from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
import logging

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = 'account.move'

    auto_stock_picking_id = fields.Many2one(
        'stock.picking',
        string='Auto Stock Picking',
        readonly=True,
        help="Stock picking automatically created from this vendor bill"
    )
    auto_stock_picking_count = fields.Integer(
        string='Auto Stock Pickings',
        compute='_compute_auto_stock_picking_count'
    )

    @api.depends('auto_stock_picking_id')
    def _compute_auto_stock_picking_count(self):
        for move in self:
            move.auto_stock_picking_count = 1 if move.auto_stock_picking_id else 0

    def action_post(self):
        """Override to create stock movements after posting vendor bills"""
        # Call the original method first
        result = super().action_post()

        # Process vendor bills for auto stock update
        vendor_bills = self.filtered(
            lambda m: m.move_type == 'in_invoice'
                      and m.state == 'posted'
                      and not m.auto_stock_picking_id
        )

        _logger.info(f"Found {len(vendor_bills)} vendor bills to process for auto stock update")

        for bill in vendor_bills:
            try:
                _logger.info(f"Processing bill {bill.name} for auto stock update")
                bill._create_auto_stock_picking()
            except Exception as e:
                _logger.error(f"Failed to create auto stock picking for bill {bill.name}: {str(e)}")
                # Create a message in the chatter instead of blocking the bill
                bill.message_post(
                    body=_("Warning: Failed to automatically update stock. Error: %s") % str(e),
                    message_type='comment',
                    subtype_xmlid='mail.mt_note'
                )

        return result

    def _create_auto_stock_picking(self):
        """Create stock picking and moves from vendor bill"""
        self.ensure_one()

        _logger.info(f"Starting auto stock picking creation for bill {self.name}")

        if self.move_type != 'in_invoice':
            _logger.info(f"Bill {self.name} is not a vendor bill, skipping")
            return

        # Filter stockable products only
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        _logger.info(f"Found {len(stockable_lines)} stockable lines in bill {self.name}")
        for line in stockable_lines:
            _logger.info(f"  - Product: {line.product_id.name}, Qty: {line.quantity}, Type: {line.product_id.type}")

        if not stockable_lines:
            _logger.info(f"No stockable products found in bill {self.name}, skipping")
            return

        # Create direct stock updates using quant method
        self._create_direct_stock_update(stockable_lines)

    def _create_direct_stock_update(self, stockable_lines):
        """Create direct stock update using stock.quant methods"""
        _logger.info("Creating direct stock update using quant methods")

        # Get the default stock location
        warehouse = self.env['stock.warehouse'].search([
            ('company_id', '=', self.company_id.id)
        ], limit=1)

        if not warehouse:
            raise UserError(_("No warehouse found for company %s") % self.company_id.name)

        stock_location = warehouse.lot_stock_id
        _logger.info(f"Using stock location: {stock_location.name}")

        # Create inventory adjustment for each product
        for line in stockable_lines:
            try:
                _logger.info(f"Processing product: {line.product_id.name}, Qty: {line.quantity}")

                # Method 1: Use inventory adjustment approach
                self._create_inventory_adjustment(line.product_id, line.quantity, stock_location)

                _logger.info(f"Successfully updated stock for {line.product_id.name}")

            except Exception as e:
                _logger.error(f"Failed to update stock for product {line.product_id.name}: {str(e)}")
                raise

        # Create a reference picking for traceability
        self._create_reference_picking(stockable_lines, stock_location)

    def _create_inventory_adjustment(self, product, quantity, location):
        """Create an inventory adjustment to update stock"""
        _logger.info(f"Creating inventory adjustment for {product.name}, qty: {quantity}")

        # Check if quant exists
        existing_quant = self.env['stock.quant'].search([
            ('product_id', '=', product.id),
            ('location_id', '=', location.id)
        ], limit=1)

        if existing_quant:
            current_qty = existing_quant.quantity
            new_qty = current_qty + quantity
            _logger.info(f"Existing quant found. Current: {current_qty}, Adding: {quantity}, New: {new_qty}")
        else:
            new_qty = quantity
            _logger.info(f"No existing quant. Creating new with qty: {new_qty}")

        # Create inventory adjustment using the proper method
        quant = self.env['stock.quant'].with_context(inventory_mode=True).create({
            'product_id': product.id,
            'location_id': location.id,
            'inventory_quantity': new_qty,
        })

        # Apply the inventory adjustment
        quant.action_apply_inventory()
        _logger.info(f"Inventory adjustment applied for {product.name}")

    def _create_reference_picking(self, stockable_lines, location):
        """Create a reference picking for traceability (won't affect stock)"""
        _logger.info("Creating reference picking for traceability")

        try:
            # Get incoming picking type
            picking_type = self.env['stock.picking.type'].search([
                ('code', '=', 'incoming'),
                ('warehouse_id.company_id', '=', self.company_id.id)
            ], limit=1)

            if not picking_type:
                _logger.warning("No incoming picking type found, skipping reference picking")
                return

            # Create picking for reference only - CLEAN VALUES ONLY
            picking_vals = {
                'partner_id': self.partner_id.id,
                'picking_type_id': picking_type.id,
                'location_id': self.partner_id.property_stock_supplier.id,
                'location_dest_id': location.id,
                'origin': f"{self.name} (Auto Stock Update)",
                'company_id': self.company_id.id,
                # Don't set state to 'done' initially - let it flow naturally
            }

            # Create picking with ONLY the required fields
            picking = self.env['stock.picking'].create(picking_vals)
            _logger.info(f"Created picking {picking.name}")

            # Create stock moves for reference
            for line in stockable_lines:
                move_vals = {
                    'name': f"{line.product_id.name} (Auto Update from {self.name})",
                    'product_id': line.product_id.id,
                    'product_uom': line.product_uom_id.id,
                    'product_uom_qty': line.quantity,
                    'location_id': self.partner_id.property_stock_supplier.id,
                    'location_dest_id': location.id,
                    'picking_id': picking.id,
                    'company_id': self.company_id.id,
                    'price_unit': line.price_unit,
                    # Don't set quantity_done or state - let Odoo handle it
                }

                move = self.env['stock.move'].create(move_vals)
                _logger.info(f"Created move {move.name}")

            # Now properly confirm and validate the picking
            _logger.info(f"Confirming picking {picking.name}")
            picking.action_confirm()

            # Set quantity_done for all moves
            for move in picking.move_ids:
                move.quantity_done = move.product_uom_qty

            # Validate the picking
            _logger.info(f"Validating picking {picking.name}")
            picking.button_validate()

            self.auto_stock_picking_id = picking.id
            _logger.info(f"Reference picking {picking.name} completed successfully")

        except Exception as e:
            _logger.error(f"Failed to create reference picking: {str(e)}")
            _logger.error(f"Error details: {type(e).__name__}: {e}")
            # Don't raise here as the stock update was successful
            # But log more details for debugging
            import traceback
            _logger.error(f"Full traceback: {traceback.format_exc()}")

    def action_view_auto_stock_picking(self):
        """Action to view the auto-created stock picking"""
        self.ensure_one()
        if not self.auto_stock_picking_id:
            return

        return {
            'type': 'ir.actions.act_window',
            'name': _('Auto Stock Picking'),
            'res_model': 'stock.picking',
            'res_id': self.auto_stock_picking_id.id,
            'view_mode': 'form',
            'target': 'current',
        }