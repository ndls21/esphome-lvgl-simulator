#!/usr/bin/env python3
"""
ESPHome LVGL Simulator WebSocket Proxy
Bridges the simulator's WebSocket to an ESPHome device's native API (TCP:6053).

Usage:
  python esphome_proxy.py --host 192.168.1.100 --password mypassword
  python esphome_proxy.py --host 192.168.1.100 --port 6053 --ws-port 6054

Requirements:
  pip install aiohttp aioesphomeapi
"""

import asyncio
import argparse
import json
import logging
from aioesphomeapi import APIClient, APIConnectionError

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('esphome-proxy')


async def proxy(host, port, password, ws_port):
    import aiohttp
    from aiohttp import web

    ws_clients = set()

    async def broadcast(msg: dict):
        text = json.dumps(msg)
        disconnected = set()
        for ws in ws_clients:
            try:
                await ws.send_str(text)
            except Exception:
                disconnected.add(ws)
        ws_clients -= disconnected

    client = APIClient(host, port, password or '')

    try:
        await client.connect(login=True)
        log.info(f"Connected to ESPHome device at {host}:{port}")
    except APIConnectionError as e:
        log.error(f"Connection failed: {e}")
        log.error("Check that the device is reachable and the password is correct.")
        return

    entities, services = await client.list_entities_services()
    entity_list = [
        {
            'key': e.key,
            'name': e.name,
            'object_id': e.object_id,
            'type': type(e).__name__,
            'unit': getattr(e, 'unit_of_measurement', ''),
        }
        for e in entities
    ]
    log.info(f"Found {len(entity_list)} entities")

    def state_callback(state):
        asyncio.create_task(broadcast({
            'type': 'state',
            'key': state.key,
            'value': state.state if hasattr(state, 'state') else None,
        }))

    await client.subscribe_states(state_callback)
    log.info("Subscribed to state updates")

    async def ws_handler(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        ws_clients.add(ws)
        log.info(f"Browser connected ({len(ws_clients)} total)")
        await ws.send_str(json.dumps({'type': 'entities', 'entities': entity_list}))
        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.ERROR:
                    log.warning(f"WebSocket error: {ws.exception()}")
        finally:
            ws_clients.discard(ws)
            log.info(f"Browser disconnected ({len(ws_clients)} remaining)")
        return ws

    app = web.Application()
    app.router.add_get('/ws', ws_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', ws_port)
    await site.start()
    log.info(f"Proxy listening on ws://localhost:{ws_port}/ws")
    log.info("Open the simulator and click 'Connect to Device'")

    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        pass
    finally:
        log.info("Shutting down...")
        await client.disconnect()
        await runner.cleanup()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ESPHome LVGL Simulator WebSocket Proxy')
    parser.add_argument('--host', required=True, help='ESPHome device IP or hostname')
    parser.add_argument('--port', type=int, default=6053, help='ESPHome API port (default: 6053)')
    parser.add_argument('--password', default='', help='ESPHome API password (if set)')
    parser.add_argument('--ws-port', type=int, default=6054, dest='ws_port',
                        help='Local WebSocket port (default: 6054)')
    args = parser.parse_args()

    try:
        asyncio.run(proxy(args.host, args.port, args.password, args.ws_port))
    except KeyboardInterrupt:
        log.info("Stopped.")
