// SPDX-License-Identifier: Apache-2.0
// Renders an SVG to a square PNG with a transparent background through AppKit/CoreSVG.
// Used by scripts/render-icons.sh; CoreSVG supports gradients and feGaussianBlur but not feMerge.
import AppKit
let args = CommandLine.arguments
guard args.count == 4, let size = Int(args[3]) else { fputs("usage: svg2png in.svg out.png size\n", stderr); exit(2) }
guard let image = NSImage(contentsOfFile: args[1]) else { fputs("cannot load \(args[1])\n", stderr); exit(1) }
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: size, height: size)
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx
ctx.cgContext.clear(CGRect(x: 0, y: 0, width: size, height: size))
ctx.imageInterpolation = .high
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try! png.write(to: URL(fileURLWithPath: args[2]))
