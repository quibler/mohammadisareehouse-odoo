# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import logging

_logger = logging.getLogger(__name__)


class AccountMoveCost(models.AbstractModel):
    """Mixin for AccountMove cost update functionality"""
    _name = 'account.move.cost.mixin'
    _description = 'Account Move Cost Update Mixin'

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