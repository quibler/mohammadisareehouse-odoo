# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError
import logging
import hashlib

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
    auto_stock_picking_ids = fields.One2many(
        'stock.picking',
        'vendor_bill_id',
        string='Auto Stock Pickings',
        readonly=True,
        help="Stock pickings automatically created from this vendor bill"
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

    # Discrepancy tracking
    has_stock_discrepancy = fields.Boolean(
        string='Has Stock Discrepancy',
        readonly=True,
        default=False,
        help="Indicates if there's a stock discrepancy that needs resolution"
    )
    stock_discrepancy_details = fields.Text(
        string='Stock Discrepancy Details',
        readonly=True,
        help="Details of the stock discrepancy"
    )

    # Total quantity of all products in the bill
    total_product_quantity = fields.Float(
        string='Total Product Quantity',
        compute='_compute_total_product_quantity',
        help="Total quantity of all products in this vendor bill"
    )

    @api.depends('auto_stock_picking_ids')
    def _compute_auto_stock_picking_count(self):
        for record in self:
            record.auto_stock_picking_count = len(record.auto_stock_picking_ids)

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
        for line in stockable_lines.sorted('id'):  # Sort for consistency
            hash_data += f"{line.product_id.id}:{line.quantity}:{line.price_unit}|"

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
                f"Bill content changed for {self.name}. "
                f"Previous hash: {self.stock_processed_hash}, New hash: {current_hash}")
            return True

        return False

    def _get_stockable_products_summary(self):
        """Get a summary of stockable products for warning message"""
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        summary_lines = []
        for line in stockable_lines:
            summary_lines.append(f"• {line.product_id.name}: {line.quantity} {line.product_uom_id.name}")

        return "\n".join(summary_lines)

    def _post_discrepancy_warning(self):
        """Post a warning message about stock discrepancy"""
        self.ensure_one()

        # Get affected products summary
        products_summary = self._get_stockable_products_summary()

        # Store discrepancy details for the resolution wizard
        discrepancy_details = f"""Stock discrepancy detected for vendor bill {self.name}.

The content of this vendor bill has changed since stock moves were last created.
New automatic stock moves have been generated based on the current bill content.

AFFECTED PRODUCTS:
{products_summary}

ACTION REQUIRED:
• Review the previous automatic stock moves
• Use the 'Resolve Stock Discrepancy' button to view and correct the issue
• Check inventory levels for affected products"""

        self.stock_discrepancy_details = discrepancy_details
        self.has_stock_discrepancy = True

        # Post clean message to chatter (no HTML)
        warning_message = f"""⚠️ STOCK DISCREPANCY WARNING

The content of this vendor bill has changed since stock moves were last created.
New automatic stock moves have been generated based on the current bill content.

ACTION REQUIRED:
• Review the previous automatic stock moves
• Use the 'Resolve Stock Discrepancy' button to view and correct the issue
• Check inventory levels for affected products

AFFECTED PRODUCTS:
{products_summary}"""

        self.message_post(
            body=warning_message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        # Also log for admin attention (clean log message)
        _logger.warning(f"Stock discrepancy detected for bill {self.name}. Manual review required.")

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

                # Create stock movements using proper stock moves
                bill._create_proper_stock_moves()

                # Update tracking fields
                bill.stock_processed_hash = bill._compute_bill_content_hash()
                bill.stock_moves_created = True

                # Post warning if content changed
                if is_content_change:
                    bill._post_discrepancy_warning()
                else:
                    # Clear any previous discrepancy flags for fresh processing
                    bill.has_stock_discrepancy = False
                    bill.stock_discrepancy_details = False

            except Exception as e:
                _logger.error(f"Failed to process bill {bill.name}: {str(e)}")
                # Create a message in the chatter instead of blocking the bill
                bill.message_post(
                    body=f"❌ Error: Failed to automatically process vendor bill. Error: {str(e)}",
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

    def action_view_auto_stock_pickings(self):
        """Action to view all auto-created stock pickings"""
        self.ensure_one()
        if not self.auto_stock_picking_ids:
            return

        if len(self.auto_stock_picking_ids) == 1:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Auto Stock Picking'),
                'res_model': 'stock.picking',
                'view_mode': 'form',
                'res_id': self.auto_stock_picking_ids[0].id,
                'target': 'current',
            }
        else:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Auto Stock Pickings'),
                'res_model': 'stock.picking',
                'view_mode': 'tree,form',
                'domain': [('id', 'in', self.auto_stock_picking_ids.ids)],
                'target': 'current',
            }

    def action_resolve_stock_discrepancy(self):
        """Open wizard to resolve stock discrepancy"""
        self.ensure_one()

        if not self.has_stock_discrepancy:
            raise UserError(_("No stock discrepancy found for this vendor bill."))

        return {
            'type': 'ir.actions.act_window',
            'name': _('Resolve Stock Discrepancy'),
            'res_model': 'vendor.bill.stock.discrepancy.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_vendor_bill_id': self.id,
            }
        }

    def _create_proper_stock_moves(self):
        """Create proper stock moves with full traceability - Odoo Standard Way"""
        self.ensure_one()

        _logger.info(f"Starting proper stock moves creation for bill {self.name}")

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

        if not stockable_lines:
            _logger.info(f"No stockable products found in bill {self.name}, skipping")
            return

        # Get incoming picking type
        picking_type = self.env['stock.picking.type'].search([
            ('code', '=', 'incoming'),
            ('warehouse_id.company_id', '=', self.company_id.id)
        ], limit=1)

        if not picking_type:
            raise UserError(_("No incoming picking type found for company %s") % self.company_id.name)

        # Create stock picking
        picking_vals = {
            'picking_type_id': picking_type.id,
            'location_id': self.partner_id.property_stock_supplier.id,
            'location_dest_id': picking_type.default_location_dest_id.id,
            'origin': f"Vendor Bill: {self.name}",
            'partner_id': self.partner_id.id,
            'company_id': self.company_id.id,
            'immediate_transfer': True,
            'vendor_bill_id': self.id,  # Link back to vendor bill
        }

        picking = self.env['stock.picking'].create(picking_vals)
        _logger.info(f"Created picking {picking.name}")

        # Create stock moves for each line
        moves_created = []
        for line in stockable_lines:
            move_vals = {
                'name': f"{line.product_id.name} (from {self.name})",
                'product_id': line.product_id.id,
                'product_uom_qty': line.quantity,
                'product_uom': line.product_uom_id.id,
                'location_id': self.partner_id.property_stock_supplier.id,
                'location_dest_id': picking_type.default_location_dest_id.id,
                'picking_id': picking.id,
                'origin': f"Vendor Bill: {self.name}",
                'company_id': self.company_id.id,
                'to_refund': True,  # Allow returns if needed
                'price_unit': line.price_unit,  # For proper valuation
            }

            move = self.env['stock.move'].create(move_vals)
            moves_created.append(move)

            # Create move lines for immediate transfer
            move_line_vals = {
                'move_id': move.id,
                'product_id': line.product_id.id,
                'product_uom_id': line.product_uom_id.id,
                'quantity': line.quantity,
                'location_id': self.partner_id.property_stock_supplier.id,
                'location_dest_id': picking_type.default_location_dest_id.id,
            }

            self.env['stock.move.line'].create(move_line_vals)

            _logger.info(f"Created move for product {line.product_id.name}, qty: {line.quantity}")

        # Process the picking through standard Odoo workflow
        picking.action_confirm()
        picking.action_assign()
        picking.button_validate()

        _logger.info(f"Successfully processed picking {picking.name} with {len(moves_created)} moves")

        return picking

    def _update_product_costs_from_bill(self):
        """Update product costs based on vendor bill prices - only from latest bills"""
        self.ensure_one()

        if self.move_type != 'in_invoice' or self.state != 'posted':
            return

        _logger.info(f"Starting cost update for bill {self.name}")

        # Get vendor bill lines with products - all stockable products are eligible for cost updates
        cost_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and line.price_unit > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        if not cost_lines:
            _logger.info(f"No cost update eligible lines found in bill {self.name}")
            return

        # Get minimum cost difference threshold
        min_cost_diff = float(self.env['ir.config_parameter'].sudo().get_param(
            'auto_stock_update.min_cost_difference', 0.01))

        updated_count = 0
        skipped_count = 0

        for line in cost_lines:
            try:
                product = line.product_id

                # CRITICAL: Check if this is the latest bill for this product
                if not self._is_latest_bill_for_product(product):
                    _logger.info(
                        f"Skipping cost update for {product.name}: Not the latest bill mentioning this product")
                    skipped_count += 1
                    continue

                # Convert price to product's currency if needed
                bill_price = line.price_unit
                if self.currency_id != product.currency_id:
                    bill_price = self.currency_id._convert(
                        bill_price,
                        product.currency_id,
                        self.company_id,
                        self.date or fields.Date.context_today(self)
                    )

                # Get cost update strategy from product category
                cost_strategy = product.categ_id.cost_update_strategy or 'always'
                current_cost = product.standard_price

                # Calculate new cost based on strategy
                new_cost = self._calculate_new_cost(product, bill_price, current_cost, cost_strategy, line.quantity)

                if new_cost is None:
                    _logger.info(f"Skipped cost update for {product.name}: strategy={cost_strategy} conditions not met")
                    skipped_count += 1
                    continue

                cost_difference = abs(current_cost - new_cost)

                # Check if difference is significant enough to update
                if cost_difference >= min_cost_diff:
                    # Update the cost
                    product.write({'standard_price': new_cost})
                    updated_count += 1

                    # Log the update
                    strategy_msg = self._get_strategy_message(cost_strategy, current_cost, bill_price, new_cost)
                    self.message_post(
                        body=f"Updated cost price for product {product.name} from {current_cost} to {new_cost} {strategy_msg}",
                        message_type='comment',
                        subtype_xmlid='mail.mt_note'
                    )

                    _logger.info(
                        f"Updated cost for {product.name}: {current_cost} → {new_cost} (Strategy: {cost_strategy})")
                else:
                    _logger.info(
                        f"Skipped cost update for {product.name}: difference {cost_difference} below threshold {min_cost_diff}")
                    skipped_count += 1

            except Exception as e:
                _logger.error(f"Failed to update cost for product {line.product_id.name}: {str(e)}")
                skipped_count += 1
                continue

        _logger.info(f"Cost update completed for bill {self.name}: {updated_count} updated, {skipped_count} skipped")

    def _is_latest_bill_for_product(self, product):
        """Check if this bill is the latest one mentioning the given product"""
        self.ensure_one()

        # Find all posted vendor bills that mention this product with a date >= this bill's date
        later_bills = self.env['account.move'].search([
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'posted'),
            ('invoice_date', '>', self.invoice_date),
            ('invoice_line_ids.product_id', '=', product.id),
            ('id', '!=', self.id),  # Exclude current bill
        ], limit=1)

        # If no later bills found, this is the latest
        return not later_bills

    def _calculate_new_cost(self, product, bill_price, current_cost, strategy, quantity):
        """Calculate new cost based on the selected strategy"""

        if strategy == 'always':
            return bill_price

        elif strategy == 'if_higher':
            return bill_price if bill_price > current_cost else None

        elif strategy == 'if_lower':
            return bill_price if bill_price < current_cost else None

        elif strategy == 'weighted_average':
            # Calculate weighted average with existing stock
            current_qty = product.qty_available
            if current_qty <= 0:
                # No existing stock, use bill price directly
                return bill_price
            else:
                # Weighted average: (current_cost * current_qty + bill_price * new_qty) / (current_qty + new_qty)
                total_value = (current_cost * current_qty) + (bill_price * quantity)
                total_qty = current_qty + quantity
                return total_value / total_qty if total_qty > 0 else bill_price

        return None  # Unknown strategy

    def _get_strategy_message(self, strategy, old_cost, bill_price, new_cost):
        """Get descriptive message for cost update strategy"""
        messages = {
            'always': f"(Strategy: Always Update - Bill Price: {bill_price})",
            'if_higher': f"(Strategy: Update if Higher - Bill Price: {bill_price})",
            'if_lower': f"(Strategy: Update if Lower - Bill Price: {bill_price})",
            'weighted_average': f"(Strategy: Weighted Average - Bill Price: {bill_price}, Calculated: {new_cost})",
        }
        return messages.get(strategy, f"(Strategy: {strategy})")

    @api.model
    def _check_cost_consistency_on_save(self):
        """Check cost consistency when bill lines are modified"""
        # This will be called from write method to ensure consistency during edits
        for move in self:
            if move.move_type == 'in_invoice' and move.state == 'posted':
                # Re-run cost update to ensure consistency
                move._update_product_costs_from_bill()

    def write(self, vals):
        """Override write to check cost consistency on line changes"""
        # Check if invoice lines are being modified
        lines_modified = 'invoice_line_ids' in vals

        result = super().write(vals)

        # If lines were modified and bill is posted, check cost consistency
        if lines_modified:
            posted_bills = self.filtered(lambda m: m.move_type == 'in_invoice' and m.state == 'posted')
            for bill in posted_bills:
                # Only update if this bill is still the latest for its products
                bill._update_product_costs_from_bill()

        return result

    def reset_stock_processing(self):
        """Reset stock processing flags - use with caution"""
        self.ensure_one()

        if not self.env.user.has_group('stock.group_stock_manager'):
            raise UserError(_("Only stock managers can reset stock processing flags."))

        self.write({
            'stock_moves_created': False,
            'stock_processed_hash': False,
            'has_stock_discrepancy': False,
            'stock_discrepancy_details': False,
        })

        self.message_post(
            body="Stock processing flags have been reset. Next posting will create fresh stock moves.",
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        _logger.info(f"Stock processing flags reset for bill {self.name} by user {self.env.user.name}")