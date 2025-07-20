# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = 'account.move'

    # Enhanced fields for auto stock functionality
    auto_stock_picking_id = fields.Many2one(
        'stock.picking',
        string='Auto Stock Picking',
        readonly=True
    )
    auto_stock_picking_count = fields.Integer(
        string='Stock Picking Count',
        compute='_compute_auto_stock_picking_count'
    )

    @api.depends('auto_stock_picking_id')
    def _compute_auto_stock_picking_count(self):
        for record in self:
            record.auto_stock_picking_count = 1 if record.auto_stock_picking_id else 0

    @api.model
    def default_get(self, fields_list):
        """Override default_get to set default dates for vendor bills"""
        defaults = super().default_get(fields_list)

        # Check if this is a vendor bill context
        move_type = defaults.get('move_type') or self._context.get('default_move_type')

        # Set default dates for vendor bills (in_invoice and in_refund)
        if move_type in ('in_invoice', 'in_refund', 'in_receipt'):
            today = fields.Date.context_today(self)

            # Set default invoice_date (Bill Date) to today only if not already set
            if 'invoice_date' in fields_list and not defaults.get('invoice_date'):
                defaults['invoice_date'] = today

            # Set default date (Accounting Date) to today only if not already set
            if 'date' in fields_list and not defaults.get('date'):
                defaults['date'] = today

        return defaults

    def action_post(self):
        """Override to create stock movements and update costs after posting vendor bills"""
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

                # Update product costs FIRST (before stock movements)
                bill._update_product_costs_from_bill()

                # Create stock movements
                bill._create_auto_stock_picking()

            except Exception as e:
                _logger.error(f"Failed to process bill {bill.name}: {str(e)}")
                # Create a message in the chatter instead of blocking the bill
                bill.message_post(
                    body=_("Warning: Failed to automatically process vendor bill. Error: %s") % str(e),
                    message_type='comment',
                    subtype_xmlid='mail.mt_note'
                )

        return result

    def action_view_auto_stock_picking(self):
        """Action to view the auto-created stock picking"""
        self.ensure_one()
        if not self.auto_stock_picking_id:
            return

        return {
            'type': 'ir.actions.act_window',
            'name': _('Auto Stock Picking'),
            'res_model': 'stock.picking',
            'view_mode': 'form',
            'res_id': self.auto_stock_picking_id.id,
            'target': 'current',
        }

    def _update_product_costs_from_bill(self):
        """Update product costs based on vendor bill prices"""
        self.ensure_one()

        if self.move_type != 'in_invoice' or self.state != 'posted':
            return

        _logger.info(f"Starting cost update for bill {self.name}")

        # Get vendor bill lines with products
        cost_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
                         and line.product_id.categ_id.auto_update_cost_from_bill
        )

        _logger.info(f"Found {len(cost_lines)} lines for cost update")

        for line in cost_lines:
            try:
                self._update_product_cost_from_line(line)
            except Exception as e:
                _logger.error(f"Failed to update cost for product {line.product_id.name}: {str(e)}")

    def _update_product_cost_from_line(self, line):
        """Update individual product cost from bill line"""
        product = line.product_id
        _logger.info(f"Updating cost for product: {product.name}")

        # Calculate unit price in company currency
        unit_price_company_currency = line.price_unit

        # Handle currency conversion if needed
        if self.currency_id != self.company_id.currency_id:
            unit_price_company_currency = self.currency_id._convert(
                line.price_unit,
                self.company_id.currency_id,
                self.company_id,
                self.invoice_date or fields.Date.context_today(self)
            )

        # Get cost update strategy from product category
        cost_update_strategy = product.categ_id.cost_update_strategy or 'always'
        current_cost = product.standard_price

        # Calculate new cost based on strategy
        if cost_update_strategy == 'always':
            new_cost = unit_price_company_currency
        elif cost_update_strategy == 'if_higher':
            new_cost = max(current_cost, unit_price_company_currency)
        elif cost_update_strategy == 'if_lower':
            new_cost = min(current_cost, unit_price_company_currency)
        elif cost_update_strategy == 'weighted_average':
            # Calculate weighted average based on existing stock
            existing_qty = product.qty_available
            bill_qty = line.quantity
            total_qty = existing_qty + bill_qty

            if total_qty > 0:
                new_cost = ((current_cost * existing_qty) + (unit_price_company_currency * bill_qty)) / total_qty
            else:
                new_cost = unit_price_company_currency
        else:
            new_cost = unit_price_company_currency

        # Check minimum cost difference to avoid unnecessary updates
        min_diff = float(
            self.env['ir.config_parameter'].sudo().get_param('auto_stock_update.min_cost_difference', '0.01'))

        if abs(new_cost - current_cost) < min_diff:
            _logger.info(f"Cost difference too small for {product.name}, skipping update")
            return

        # Update product cost
        product.with_context(auto_cost_update=True).write({
            'standard_price': new_cost
        })

        _logger.info(
            f"Updated cost for product {product.name} "
            f"from {current_cost} to {new_cost} "
            f"based on vendor bill {self.name}"
        )

        # Add message to product
        product.message_post(
            body=_(
                "Cost price updated from %s to %s based on vendor bill %s (Strategy: %s)"
            ) % (current_cost, new_cost, self.name, cost_update_strategy),
            message_type='comment'
        )

        # Add message to vendor bill
        self.message_post(
            body=_(
                "Updated cost price for product %s from %s to %s (Strategy: %s)"
            ) % (product.name, current_cost, new_cost, cost_update_strategy),
            message_type='comment'
        )

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
                self._create_inventory_adjustment(line.product_id, line.quantity, stock_location)
                _logger.info(f"Successfully updated stock for {line.product_id.name}")

            except Exception as e:
                _logger.error(f"Failed to update stock for product {line.product_id.name}: {str(e)}")
                raise

        # Create a reference picking for traceability
        self._create_reference_picking(stockable_lines, stock_location)

    def _create_inventory_adjustment(self, product, quantity, location):
        """Create an inventory adjustment to update stock with proper vendor bill reference"""
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

        # Create meaningful reference name for the inventory adjustment
        vendor_name = self.partner_id.name or "Vendor"
        adjustment_reference = f"Stock Receipt from {vendor_name} - {self.name}"

        _logger.info(f"Using inventory adjustment reference: {adjustment_reference}")

        # Create inventory adjustment using the proper method with custom reference
        quant = self.env['stock.quant'].with_context(
            inventory_mode=True,
            inventory_name=adjustment_reference  # This will be used as the stock move reference
        ).create({
            'product_id': product.id,
            'location_id': location.id,
            'inventory_quantity': new_qty,
        })

        # Apply the inventory adjustment with custom reference
        quant.with_context(inventory_name=adjustment_reference).action_apply_inventory()
        _logger.info(f"Inventory adjustment applied for {product.name} with reference: {adjustment_reference}")

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

            # Create picking for reference only
            picking_vals = {
                'partner_id': self.partner_id.id,
                'picking_type_id': picking_type.id,
                'location_id': self.partner_id.property_stock_supplier.id,
                'location_dest_id': location.id,
                'origin': f"{self.name} (Auto Stock Update)",
                'company_id': self.company_id.id,
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