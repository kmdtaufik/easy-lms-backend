import express from "express";
import { StatsService } from "@/services/stats";

const router: express.Router = express.Router();

// GET dashboard stats
router.get("/dashboard", async (req, res) => {
  try {
    const stats = await StatsService.getDashboardStats();
    res.status(200).json({ data: stats });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ message: "Failed to fetch statistics" });
  }
});

// GET quick stats
router.get("/quick", async (req, res) => {
  try {
    const stats = await StatsService.getQuickStats();
    res.status(200).json({ data: stats });
  } catch (error) {
    console.error("Quick stats error:", error);
    res.status(500).json({ message: "Failed to fetch quick statistics" });
  }
});

// GET stats for custom period
router.get("/period", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "Start date and end date are required",
      });
    }

    const stats = await StatsService.getStatsForPeriod(
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.status(200).json({ data: stats });
  } catch (error) {
    console.error("Period stats error:", error);
    res.status(500).json({ message: "Failed to fetch period statistics" });
  }
});

export default router;
