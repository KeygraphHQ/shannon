import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateHtml, type ScanReportData } from "@/lib/export/pdf-generator";
import { sarifToJson, type ScanExportData } from "@/lib/export/sarif-exporter";

interface RouteParams {
  params: Promise<{ scanId: string }>;
}

/**
 * GET /api/scans/[scanId]/export - Export scan report in various formats
 * Query params: format (pdf, json, html)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json(
        { error: "No organization found", code: "NO_ORGANIZATION" },
        { status: 400 }
      );
    }

    const { scanId } = await params;
    const orgId = user.memberships[0].organizationId;

    // Parse format from query params
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "json";

    if (!["pdf", "json", "html"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format. Use: pdf, json, or html", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Fetch scan with project and result
    const scan = await db.scan.findFirst({
      where: {
        id: scanId,
        organizationId: orgId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            targetUrl: true,
            repositoryUrl: true,
          },
        },
        result: true,
      },
    });

    if (!scan) {
      return NextResponse.json(
        { error: "Scan not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Check if scan is completed
    if (scan.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "Scan is not completed. Export is only available for completed scans.",
          code: "SCAN_NOT_COMPLETED",
        },
        { status: 400 }
      );
    }

    // Generate filename
    const timestamp = new Date().toISOString().split("T")[0];
    const safeProjectName = scan.project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const filename = `shannon-report-${safeProjectName}-${timestamp}`;

    // Handle different formats
    switch (format) {
      case "json": {
        // Generate SARIF JSON
        const exportData: ScanExportData = {
          scan: {
            ...scan,
            project: scan.project,
          },
          // TODO: Add detailed findings from scan result when available
        };

        const sarifJson = sarifToJson(exportData);

        return new NextResponse(sarifJson, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${filename}.sarif.json"`,
          },
        });
      }

      case "html": {
        // Generate HTML report
        const reportData: ScanReportData = {
          scan: {
            ...scan,
            project: scan.project,
          },
          // TODO: Fetch markdown content from storage if available
        };

        const html = generateHtml(reportData);

        return new NextResponse(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}.html"`,
          },
        });
      }

      case "pdf": {
        // Generate PDF report
        try {
          const { generatePdf } = await import("@/lib/export/pdf-generator");

          const reportData: ScanReportData = {
            scan: {
              ...scan,
              project: scan.project,
            },
            // TODO: Fetch markdown content from storage if available
          };

          const pdfBuffer = await generatePdf(reportData);

          return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${filename}.pdf"`,
              "Content-Length": pdfBuffer.length.toString(),
            },
          });
        } catch (pdfError) {
          console.error("PDF generation failed:", pdfError);

          // Fall back to HTML if PDF generation fails
          const reportData: ScanReportData = {
            scan: {
              ...scan,
              project: scan.project,
            },
          };

          const html = generateHtml(reportData);

          return new NextResponse(html, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Disposition": `attachment; filename="${filename}.html"`,
              "X-PDF-Fallback": "true",
            },
          });
        }
      }

      default:
        return NextResponse.json(
          { error: "Invalid format", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error exporting scan:", error);
    return NextResponse.json(
      { error: "Failed to export scan", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
