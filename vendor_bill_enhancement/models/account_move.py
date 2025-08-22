# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    # Simple line number - only shown after save
    line_number = fields.Integer(
        string='Line #',
        compute='_compute_line_number',
        help="Sequential line number for invoice lines"
    )

    def _compute_line_number(self):
        """Simple line numbering - only for saved records"""
        for line in self:
            # Only show numbers if the move is saved (has ID) and is a product line
            if (line.move_id and line.move_id.id and
                    line.display_type == 'product'):

                # Get all saved product lines, ordered by sequence
                product_lines = line.move_id.invoice_line_ids.filtered(
                    lambda l: l.display_type == 'product' and l.id
                ).sorted('sequence')

                # Find position and set number
                for index, product_line in enumerate(product_lines, 1):
                    if product_line.id == line.id:
                        line.line_number = index
                        break
                else:
                    line.line_number = 0
            else:
                line.line_number = 0


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
    # Track if stock has been processed and content hash
    stock_processed_hash = fields.Char(
        string='Stock Processing Hash',
        readonly=True,
        help="Hash of bill content to track if stock has been processed"
    )
    stock_moves_created = fields.Boolean(
        string='Stock Moves Created',
        readonly=True,
        default=False,
        help="Indicates if automatic stock moves have been created for this bill"
    )

    # Total quantity of all products in the bill
    total_product_quantity = fields.Float(
        string='Total Product Quantity',
        compute='_compute_total_product_quantity',
        help="Total quantity of all products in this vendor bill"
    )

    @api.depends('auto_stock_picking_id')
    def _compute_auto_stock_picking_count(self):
        for record in self:
            record.auto_stock_picking_count = 1 if record.auto_stock_picking_id else 0

    @api.depends('invoice_line_ids.quantity')
    def _compute_total_product_quantity(self):
        """Compute total quantity of all products"""
        for move in self:
            total_qty = 0
            for line in move.invoice_line_ids:
                if (line.product_id and
                        line.product_id.type in ['product', 'consu'] and
                        line.quantity > 0 and
                        line.display_type == 'product'):
                    total_qty += line.quantity
            move.total_product_quantity = total_qty

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

    def _compute_bill_content_hash(self):
        """Compute a hash of the bill content to detect changes (excluding vendor)"""
        self.ensure_one()

        # Get stockable lines for hash computation
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        # Create a string representation of the relevant bill data (no vendor name)
        hash_data = f"{self.name}|"
        for line in stockable_lines:
            # Use a safe way to get line id for hash
            line_id = line.id if line.id else hash(line)
            hash_data += f"{line.product_id.id}:{line.quantity}:{line.price_unit}:{line_id}|"

        import hashlib
        return hashlib.md5(hash_data.encode()).hexdigest()

    def _should_process_stock(self):
        """Check if stock should be processed for this bill"""
        self.ensure_one()

        if self.move_type != 'in_invoice' or self.state != 'posted':
            return False

        # Get current content hash
        current_hash = self._compute_bill_content_hash()

        # If no stock has been processed yet, process it
        if not self.stock_moves_created:
            return True

        # If content has changed, process new stock and warn about discrepancy
        if self.stock_processed_hash != current_hash:
            _logger.warning(
                f"Bill content changed for {self.name}. Previous hash: {self.stock_processed_hash}, New hash: {current_hash}")
            return True

        return False

    def _post_discrepancy_warning(self):
        """Post a warning message about stock discrepancy"""
        self.ensure_one()

        warning_message = _(
            "⚠️ <strong>STOCK DISCREPANCY WARNING</strong><br/><br/>"
            "The content of this vendor bill has changed since stock moves were last created. "
            "New automatic stock moves have been generated based on the current bill content.<br/><br/>"
            "<strong>Action Required:</strong><br/>"
            "• Review the previous automatic stock moves<br/>"
            "• Manually reverse/adjust previous stock moves if necessary<br/>"
            "• Check inventory levels for affected products<br/><br/>"
            "<strong>Affected Products:</strong><br/>"
            "%s"
        ) % self._get_stockable_products_summary()

        self.message_post(
            body=warning_message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        # Also log for admin attention
        _logger.warning(f"Stock discrepancy detected for bill {self.name}. Manual review required.")

    def _get_stockable_products_summary(self):
        """Get a summary of stockable products for warning message"""
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        summary = ""
        for line in stockable_lines:
            summary += f"• {line.product_id.name}: {line.quantity} {line.product_uom_id.name}<br/>"

        return summary

    def action_post(self):
        """Override to create stock movements and update costs after posting vendor bills"""
        # Call the original method first
        result = super().action_post()

        # Process vendor bills for auto stock update
        vendor_bills = self.filtered(lambda m: m._should_process_stock())

        _logger.info(f"Found {len(vendor_bills)} vendor bills to process for auto stock update")

        for bill in vendor_bills:
            try:
                _logger.info(f"Processing bill {bill.name} for auto stock update")

                # Check if this is a content change (not first time processing)
                is_content_change = bill.stock_moves_created and bill.stock_processed_hash != bill._compute_bill_content_hash()

                # Update product costs FIRST (before stock movements)
                bill._update_product_costs_from_bill()

                # Create stock movements
                bill._create_auto_stock_picking()

                # Update tracking fields
                bill.stock_processed_hash = bill._compute_bill_content_hash()
                bill.stock_moves_created = True

                # Post warning if content changed
                if is_content_change:
                    bill._post_discrepancy_warning()

            except Exception as e:
                _logger.error(f"Failed to process bill {bill.name}: {str(e)}")
                # Create a message in the chatter instead of blocking the bill
                bill.message_post(
                    body=_("❌ <strong>Error:</strong> Failed to automatically process vendor bill. Error: %s") % str(e),
                    message_type='comment',
                    subtype_xmlid='mail.mt_note'
                )

        return result

    def button_draft(self):
        """Override to handle stock processing tracking when bill goes to draft"""
        result = super().button_draft()

        # When going to draft, keep the tracking info for comparison
        # Don't clear stock_moves_created or hash - this allows detection of changes
        _logger.info(f"Bill {self.name} set to draft. Stock tracking info preserved for change detection.")

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

        # Create direct stock updates
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
        """Create an inventory adjustment to add stock with proper vendor bill reference"""
        _logger.info(f"Creating inventory adjustment for {product.name}, adding qty: {quantity}")

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

        # Use _update_available_quantity to properly update stock
        self.env['stock.quant']._update_available_quantity(
            product,
            location,
            quantity=quantity,
            in_date=fields.Datetime.now()
        )

        _logger.info(f"Stock updated successfully for {product.name}")

    def _create_reference_picking(self, stockable_lines, location):
        """Create stock picking and moves from vendor bill for reference"""
        try:
            picking_type = self.env['stock.picking.type'].search([
                ('code', '=', 'incoming'),
                ('warehouse_id.company_id', '=', self.company_id.id)
            ], limit=1)

            if not picking_type:
                _logger.warning("No incoming picking type found, skipping reference picking")
                return

            picking_vals = {
                'picking_type_id': picking_type.id,
                'location_id': self.partner_id.property_stock_supplier.id,
                'location_dest_id': location.id,
                'origin': f"Vendor Bill: {self.name}",
                'state': 'done',
                'move_type': 'direct',
                'company_id': self.company_id.id,
            }

            # Create picking
            picking = self.env['stock.picking'].create(picking_vals)
            _logger.info(f"Created picking {picking.name}")

            # Store reference to the most recent picking
            self.auto_stock_picking_id = picking.id

            # Create stock moves for reference
            for line in stockable_lines:
                move_vals = {
                    'name': f"{line.product_id.name} (Auto from {self.name})",
                    'product_id': line.product_id.id,
                    'product_uom': line.product_uom_id.id,
                    'product_uom_qty': line.quantity,
                    'location_id': self.partner_id.property_stock_supplier.id,
                    'location_dest_id': location.id,
                    'picking_id': picking.id,
                    'company_id': self.company_id.id,
                    'state': 'done',
                }

                self.env['stock.move'].create(move_vals)

            _logger.info(f"Created {len(stockable_lines)} reference moves in picking {picking.name}")

        except Exception as e:
            _logger.error(f"Failed to create reference picking: {str(e)}")
            # Don't fail the whole process if reference picking fails

    # Keep existing cost update methods unchanged
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
                         and line.price_unit > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        _logger.info(f"Found {len(cost_lines)} cost lines to process")

        for line in cost_lines:
            try:
                product = line.product_id

                # Get the price in bill currency
                bill_currency_price = line.price_unit

                # Convert to company currency if needed
                if self.currency_id != self.company_id.currency_id:
                    # Convert from bill currency to company currency
                    new_cost = self.currency_id._convert(
                        bill_currency_price,
                        self.company_id.currency_id,
                        self.company_id,
                        self.invoice_date or fields.Date.context_today(self)
                    )
                    _logger.info(
                        f"Currency conversion: {bill_currency_price} {self.currency_id.name} -> {new_cost} {self.company_id.currency_id.name}")
                else:
                    new_cost = bill_currency_price

                _logger.info(f"Updating cost for {product.name}: {product.standard_price} -> {new_cost}")

                # Update the product cost
                product.with_context(disable_auto_svl=True).write({
                    'standard_price': new_cost
                })

                _logger.info(f"Successfully updated cost for {product.name}")

            except Exception as e:
                _logger.error(f"Failed to update cost for product {line.product_id.name}: {str(e)}")
                continue