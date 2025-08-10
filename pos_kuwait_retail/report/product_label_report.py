from odoo import models
from collections import defaultdict


class ReportProductTemplateLabelDymo(models.AbstractModel):
    _inherit = 'report.product.report_producttemplatelabel_dymo'

    def _get_report_values(self, docids, data):
        """Override to include custom_price in template context"""
        # Get the original report values
        result = super()._get_report_values(docids, data)

        # Add custom_price to the context if provided
        if data and data.get('custom_price'):
            result['custom_price'] = data.get('custom_price')

        return result