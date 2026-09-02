# Digital employee skill loader requires exact catalog names

Digital employee Agents publish a scoped skill catalog before model work begins. The model-facing `skill` tool loads one exact name from that catalog; catalog discovery is separate and `list` is never a valid loader argument. Keep the catalog and loader on the same restricted Agent scope so employee authorization cannot broaden through a Host-global fallback.
