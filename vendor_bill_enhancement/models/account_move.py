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
        """Post a clear warning message about stock discrepancy"""
        self.ensure_one()

        # Get affected products summary
        products_summary = self._get_stockable_products_summary()
        picking_count = len(self.auto_stock_picking_ids)

        # Create clear, actionable warning message
        warning_message = f"""⚠️ STOCK DISCREPANCY DETECTED

This vendor bill was modified after stock moves were already created, resulting in duplicate inventory movements.

CURRENT SITUATION:
• Total stock pickings created: {picking_count}
• Products with duplicate moves: 
{products_summary}

AUTOMATIC RESOLUTION:
Click the "Resolve Stock Discrepancy" button to automatically fix this by reverting all previous stock moves except the most recent one.

This will clean up your inventory and eliminate duplicate stock movements."""

        # Store details for the resolution process
        self.stock_discrepancy_details = f"""Stock discrepancy detected for vendor bill {self.name}.

The bill content changed after stock moves were created.
Current picking count: {picking_count}
Products affected: {products_summary.replace('• ', '').replace(chr(10), ', ')}"""

        self.has_stock_discrepancy = True

        self.message_post(
            body=warning_message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        _logger.warning(f"Stock discrepancy detected for bill {self.name}. {picking_count} pickings exist. Resolution required.")

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
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'warning',
                    'message': _('No stock pickings found for this vendor bill.'),
                }
            }

        if len(self.auto_stock_picking_ids) == 1:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Auto Stock Picking'),
                'res_model': 'stock.picking',
                'view_mode': 'form',
                'res_id': self.auto_stock_picking_ids[0].id,
                'target': 'current',
                'views': [(False, 'form')],
            }
        else:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Auto Stock Pickings'),
                'res_model': 'stock.picking',
                'view_mode': 'list,form',  # Changed from 'tree,form' to 'list,form'
                'domain': [('id', 'in', self.auto_stock_picking_ids.ids)],
                'target': 'current',
                'views': [(False, 'list'), (False, 'form')],
                'context': {'contact_display': 'partner_address'},
            }

    def action_resolve_stock_discrepancy(self):
        """Directly resolve stock discrepancy by reverting all previous stock moves except the last one"""
        self.ensure_one()

        if not self.has_stock_discrepancy:
            raise UserError(_("No stock discrepancy found for this vendor bill."))

        if not self.env.user.has_group('stock.group_stock_manager'):
            raise UserError(_("Only stock managers can resolve stock discrepancies."))

        # Get all completed pickings sorted by creation date (newest first)
        all_done_pickings = self.auto_stock_pickup_ids.filtered(
            lambda p: p.state == 'done'
        ).sorted('create_date', reverse=True)

        _logger.info(
            f"Resolving discrepancy for {self.name}. Found {len(all_done_pickings)} done pickings: {[p.name for p in all_done_pickings]}")

        if len(all_done_pickings) <= 1:
            # Clear discrepancy if there's only one picking
            self.write({
                'has_stock_discrepancy': False,
                'stock_discrepancy_details': False,
            })
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'info',
                    'message': 'Only one stock picking exists - no previous moves to revert.',
                }
            }

        # Get all previous pickings (all except the first/newest one)
        previous_pickings = all_done_pickings[1:]
        kept_picking = all_done_pickings[0]

        _logger.info(f"Will keep picking: {kept_picking.name}, will revert: {[p.name for p in previous_pickings]}")

        # Process each previous picking individually
        return_pickings = []
        failed_pickings = []

        for picking in previous_pickings:
            try:
                return_picking = self._create_simple_return_picking(picking)
                return_pickings.append(return_picking)
                _logger.info(
                    f"Successfully created and processed return picking {return_picking.name} for {picking.name}")
            except Exception as e:
                _logger.error(f"Failed to create return for picking {picking.name}: {str(e)}")
                failed_pickings.append((picking.name, str(e)))

        if not return_pickings and failed_pickings:
            error_details = "\n".join([f"• {name}: {error}" for name, error in failed_pickings])
            raise UserError(_("Failed to create any return pickings:\n\n%s") % error_details)

        # Log successful resolution in chatter
        picking_names = [p.name for p in return_pickings]

        success_message = f"""✅ Stock discrepancy resolved successfully!

    Reverted previous stock moves to eliminate duplicates:
    • Kept most recent picking: {kept_picking.name}
    • Reverted {len(return_pickings)} previous picking{'s' if len(return_pickings) != 1 else ''}: {', '.join(picking_names)}

    Your inventory is now clean with only the latest stock moves active."""

        if failed_pickings:
            failure_details = "\n".join([f"• {name}: {error}" for name, error in failed_pickings])
            success_message += f"\n\n⚠️ Some pickings could not be reverted:\n{failure_details}"

        self.message_post(
            body=success_message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        # Clear discrepancy flags
        self.write({
            'has_stock_discrepancy': False,
            'stock_discrepancy_details': False,
        })

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': f'Stock discrepancy resolved! Reverted {len(return_pickings)} previous stock moves.',
            }
        }

    def _create_simple_return_picking(self, original_picking):
        """Create a return picking using a simpler, more direct approach"""
        _logger.info(f"Creating simple return picking for {original_picking.name}")

        if original_picking.state != 'done':
            raise UserError(_("Cannot return picking %s - not in done state") % original_picking.name)

        # Get return type
        return_type = original_picking.picking_type_id.return_picking_type_id
        if not return_type:
            # If no specific return type, use outgoing type to reverse the incoming
            return_type = self.env['stock.picking.type'].search([
                ('code', '=', 'outgoing'),
                ('warehouse_id', '=', original_picking.picking_type_id.warehouse_id.id)
            ], limit=1)

        if not return_type:
            raise UserError(_("No return picking type found for %s") % original_picking.name)

        # Create return picking manually
        return_vals = {
            'picking_type_id': return_type.id,
            'location_id': original_picking.location_dest_id.id,  # Reverse: dest becomes source
            'location_dest_id': original_picking.location_id.id,  # Reverse: source becomes dest
            'origin': f"Return of {original_picking.name}",
            'partner_id': original_picking.partner_id.id,
            'company_id': original_picking.company_id.id,
            'return_id': original_picking.id,
            'state': 'draft',
        }

        return_picking = self.env['stock.picking'].create(return_vals)
        _logger.info(f"Created return picking {return_picking.name}")

        # Create return moves for each original move
        return_moves = []
        for move in original_picking.move_ids.filtered(lambda m: m.state == 'done' and m.quantity > 0):
            return_move_vals = {
                'name': f"Return: {move.product_id.name}",
                'product_id': move.product_id.id,
                'product_uom_qty': move.quantity,  # Return the actual delivered quantity
                'product_uom': move.product_uom.id,
                'picking_id': return_picking.id,
                'location_id': original_picking.location_dest_id.id,
                'location_dest_id': original_picking.location_id.id,
                'origin_returned_move_id': move.id,
                'to_refund': True,
                'state': 'draft',
                'company_id': original_picking.company_id.id,
                'picking_type_id': return_type.id,
            }

            return_move = self.env['stock.move'].create(return_move_vals)
            return_moves.append(return_move)
            _logger.info(f"Created return move for {move.product_id.name}, qty: {move.quantity}")

        if not return_moves:
            return_picking.unlink()
            raise UserError(_("No returnable moves found in %s") % original_picking.name)

        # Process the return picking
        return_picking.action_confirm()
        return_picking.action_assign()

        # Set move line quantities for validation
        for move in return_picking.move_ids:
            for move_line in move.move_line_ids:
                if move_line.quantity == 0:
                    move_line.quantity = move_line.reserved_qty

        return_picking.button_validate()

        _logger.info(f"Return picking {return_picking.name} processed successfully")
        return return_picking

    def _create_proper_stock_moves(self):
        """Create proper stock moves with full traceability - Odoo Standard Way"""
        self.ensure_one()

        _logger.info(f"Starting proper stock moves creation for bill {self.name}")

        # Check if this is a vendor bill (account.move.move_type)
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

        # Create stock picking - Set proper move_type for stock.picking
        picking_vals = {
            'picking_type_id': picking_type.id,
            'location_id': self.partner_id.property_stock_supplier.id,
            'location_dest_id': picking_type.default_location_dest_id.id,
            'origin': f"Vendor Bill: {self.name}",
            'partner_id': self.partner_id.id,
            'company_id': self.company_id.id,
            'move_type': 'direct',  # Set proper stock.picking move_type
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

            _logger.info(f"Created move for product {line.product_id.name}, qty: {line.quantity}")

        # Process the picking through standard Odoo workflow
        picking.action_confirm()
        picking.action_assign()

        # For Odoo 18, validate the picking directly without immediate_transfer wizard
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